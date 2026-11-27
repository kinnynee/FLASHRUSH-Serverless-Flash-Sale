"""Dry-run by default. Index only existing authenticated subjects; preserve Worker schema."""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import boto3
from boto3.dynamodb.types import TypeSerializer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy'))
from target_config import load, validate_runtime


def backfill(session, resources, execute=False):
    db = session.resource('dynamodb')
    orders, customers = db.Table(resources['OrdersTable']), db.Table(resources['CustomersTable'])
    serialize = TypeSerializer().serialize
    encoded = lambda value: {k: serialize(v) for k, v in value.items()}
    report = {'dryRun': not execute, 'candidates': 0, 'indexed': 0, 'existing': 0, 'skippedGuest': 0, 'errors': []}
    query = {}
    while True:
        page = orders.scan(**query)
        for item in page['Items']:
            owner = item.get('ownerId') or item.get('customerId')
            if not owner:
                report['skippedGuest'] += 1
                continue
            try:
                if item.get('ownerId') and item.get('customerId') and item['ownerId'] != item['customerId']:
                    raise ValueError('ConflictingOwner')
                if not isinstance(owner, str) or not item.get('createdAt'):
                    raise ValueError('MissingStableSubjectOrTimestamp')
                datetime.fromisoformat(item['createdAt'].replace('Z','+00:00'))
                key = {'userId': owner, 'recordId': 'ORDER#' + item['createdAt'] + '#' + item['orderId']}
                existing = customers.get_item(Key=key, ConsistentRead=True).get('Item')
                if existing:
                    if existing.get('orderId') != item['orderId']:
                        raise ValueError('ReferenceConflict')
                    report['existing'] += 1
                    continue
                report['candidates'] += 1
                if execute:
                    field = 'ownerId' if item.get('ownerId') else 'customerId'
                    condition = '#owner=:owner AND createdAt=:created'
                    if field == 'customerId':
                        condition += ' AND attribute_not_exists(ownerId)'
                    # Condition on the source prevents indexing an owner changed since the scan.
                    session.client('dynamodb').transact_write_items(TransactItems=[
                        {'ConditionCheck': {'TableName': orders.name, 'Key': encoded({'orderId':item['orderId']}),
                            'ConditionExpression':condition, 'ExpressionAttributeNames':{'#owner':field},
                            'ExpressionAttributeValues':encoded({':owner':owner, ':created':item['createdAt']})}},
                        {'Put': {'TableName':customers.name, 'Item':encoded({**key,'orderId':item['orderId']}),
                                 'ConditionExpression':'attribute_not_exists(userId)'}}])
                    report['indexed'] += 1
            except Exception as exc:
                report['errors'].append({'orderId':item.get('orderId'), 'errorType':type(exc).__name__})
        if 'LastEvaluatedKey' not in page:
            return report
        query['ExclusiveStartKey'] = page['LastEvaluatedKey']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--profile')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    config = load(args.inventory, 'runtime')
    session = boto3.Session(profile_name=args.profile, region_name=config['region'])
    validate_runtime(session, config['resources'], config['account'], config['region'], config['target'])
    report = backfill(session, config['resources'], args.execute)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    return 2 if report['errors'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
