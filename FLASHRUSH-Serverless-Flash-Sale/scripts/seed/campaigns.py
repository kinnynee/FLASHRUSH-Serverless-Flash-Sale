"""Offline campaign preview; explicit guarded AWS apply after review."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ('campaignId', 'name', 'startTime', 'endTime', 'productIds', 'maxQtyPerOrder')
VN = timezone(timedelta(hours=7))


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def instant(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone required')
    return parsed


def state(item, at):
    if at < instant(item['startTime']):
        return 'UPCOMING'
    if at > instant(item['endTime']):
        return 'ENDED'
    return 'ACTIVE'


def record(item):
    # Editorial descriptions are deliberately excluded: the API has no such field.
    return {key: item[key] for key in FIELDS}


def inspect(plan, products, existing, at):
    errors, warnings, additions = [], [], []
    by_product = {p['productId']: p for p in products}
    by_id = {c['campaignId']: c for c in existing}
    ids = set()
    for item in plan['campaigns']:
        cid = item['campaignId']
        if cid in ids:
            errors.append(f'Duplicate ID: {cid}')
        ids.add(cid)
        if (not cid.startswith('shop-') or not isinstance(item['name'], str)
                or not item['name'].strip() or len(item['name']) > 160
                or not item.get('description', '').strip()
                or instant(item['startTime']) >= instant(item['endTime'])
                or type(item['maxQtyPerOrder']) is not int
                or not 1 <= item['maxQtyPerOrder'] <= 100
                or not item['productIds'] or len(set(item['productIds'])) != len(item['productIds'])):
            errors.append(f'Invalid campaign: {cid}')
        for pid in item['productIds']:
            if pid not in by_product:
                errors.append(f'Missing product: {cid}/{pid}')
            elif by_product[pid].get('stock', 0) <= 0:
                warnings.append(f'Sold out: {cid}/{pid}; no restock performed')
        if cid in by_id:
            if record(item) != record(by_id[cid]):
                errors.append(f'Existing ID differs; refusing overwrite: {cid}')
        else:
            additions.append(record(item))
    combined = existing + additions
    for item in additions:
        for other in combined:
            if item['campaignId'] >= other['campaignId'] and other in additions:
                continue
            common = set(item['productIds']) & set(other['productIds'])
            if common and max(instant(item['startTime']), instant(other['startTime'])) <= min(
                    instant(item['endTime']), instant(other['endTime'])):
                errors.append(f'Overlap: {item["campaignId"]} / {other["campaignId"]}: {sorted(common)}')
    # Mirror public_product; integration tests compare both at every boundary.
    selector_errors = []
    for pid in sorted({pid for c in plan['campaigns'] for pid in c['productIds']}):
        matches = [c for c in combined if pid in c['productIds']]
        boundaries = {at}
        for c in matches:
            boundaries.update((instant(c['startTime']), instant(c['endTime']) + timedelta(microseconds=1)))
        for probe in sorted(t for t in boundaries if t >= at):
            active = [c for c in matches if state(c, probe) == 'ACTIVE']
            upcoming = [c for c in matches if state(c, probe) == 'UPCOMING']
            def priority(c):
                status = state(c, probe)
                return ({'ACTIVE': 0, 'UPCOMING': 1, 'ENDED': 2}[status],
                        -instant(c['endTime']).timestamp() if status == 'ENDED'
                        else instant(c['startTime']).timestamp(), c['campaignId'])
            chosen = min(matches, key=priority)
            if not active and upcoming and state(chosen, probe) == 'ENDED':
                selector_errors.append(f'{pid}: product ENDED but campaign UPCOMING at {probe.isoformat()}')
                break
    return {'checkedAt': at.isoformat(), 'additions': additions,
            'unchanged': len(plan['campaigns']) - len(additions),
            'errors': sorted(set(errors)), 'warnings': sorted(set(warnings)),
            'selectorBlockers': selector_errors,
            'readyToApply': not errors and not selector_errors}


def scan(table):
    items, options = [], {'ConsistentRead': True}
    while True:
        page = table.scan(**options)
        items.extend(page['Items'])
        if 'LastEvaluatedKey' not in page:
            return items
        options['ExclusiveStartKey'] = page['LastEvaluatedKey']


def apply(plan, args):
    from boto3.dynamodb.types import TypeSerializer
    sys.path.insert(0, str(ROOT / 'scripts/deploy'))
    from lab_config import connect, stack_outputs
    session = connect(args)
    outputs = stack_outputs(session, args)
    target = plan['target']
    for key in ('ProductsTable', 'CampaignsTable', 'ApiUrl'):
        if outputs[key].rstrip('/') != target[key].rstrip('/'):
            raise ValueError(f'Target mismatch: {key}')
    db = session.resource('dynamodb')
    products = scan(db.Table(outputs['ProductsTable']))
    existing = scan(db.Table(outputs['CampaignsTable']))
    result = inspect(plan, products, existing, datetime.now(timezone.utc))
    if not result['readyToApply']:
        raise ValueError('Apply blocked; review fresh dry-run errors and selectorBlockers: ' + json.dumps(result, ensure_ascii=False))
    if not result['additions']:
        return result
    serialize = TypeSerializer()
    transactions = [{'Put': {'TableName': outputs['CampaignsTable'],
        'Item': {k: serialize.serialize(v) for k, v in c.items()},
        'ConditionExpression': 'attribute_not_exists(campaignId)'}} for c in result['additions']]
    for pid in sorted({pid for c in result['additions'] for pid in c['productIds']}):
        transactions.append({'ConditionCheck': {'TableName': outputs['ProductsTable'],
            'Key': {'productId': {'S': pid}}, 'ConditionExpression': 'attribute_exists(productId)'}})
    if len(transactions) > 100:
        raise ValueError('Atomic seed exceeds transaction size limit')
    # Pause other campaign writers during apply; DynamoDB has no scan-range lock.
    session.client('dynamodb').transact_write_items(TransactItems=transactions)
    result['applied'] = len(result['additions'])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, default=ROOT / 'scripts/seed/campaigns-2026.json')
    parser.add_argument('--snapshot', type=Path, default=ROOT / 'scripts/seed/catalog-snapshot-2026-11-27.json')
    parser.add_argument('--at', help='ISO timestamp with timezone; offline preview only')
    parser.add_argument('--report', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--profile', default='dropit-admin')
    parser.add_argument('--account', default='303278700480')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--stack', choices=['flashrush-lab'], default='flashrush-lab')
    args = parser.parse_args()
    plan = read(args.plan)
    if args.apply:
        if args.at:
            parser.error('--at is offline only')
        result = apply(plan, args)
    else:
        snapshot = read(args.snapshot)
        if snapshot['target'] != plan['target']:
            raise ValueError('Snapshot target differs from plan')
        result = inspect(plan, snapshot['products'], snapshot['campaigns'],
                         instant(args.at) if args.at else datetime.now(timezone.utc))
        result['snapshotAt'] = snapshot['capturedAt']
    if args.report:
        args.report.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'additions'}, indent=2, ensure_ascii=True))
    return 0 if result['readyToApply'] else 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError) as exc:
        sys.exit(str(exc))
