"""Inspect pending orders; --resend only claims expired unsent leases. Never marks FAILED."""
import json
import os
import sys
import time
import importlib
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy'))
from lab_config import parser, connect, stack_outputs
from target_config import load, validate_runtime
import boto3


def inspect(item, epoch, min_age):
    try:
        age = max(0, int(epoch - datetime.fromisoformat(item['createdAt'].replace('Z', '+00:00')).timestamp()))
    except (KeyError, TypeError, ValueError):
        age = None
    try:
        attempts = int(item.get('enqueueAttemptCount', 0))
        if attempts < 0:
            attempts = None
    except (ValueError, TypeError):
        attempts = None
    overdue = age is None or age >= min_age
    lease = item.get('enqueueLeaseUntil', 0)
    try:
        expired = float(lease) < epoch
    except (ValueError, TypeError):
        expired = False
    eligible = overdue and age is not None and item.get('enqueueState') != 'SENT' and expired and attempts is not None and attempts < 3
    return dict(orderId=item['orderId'], ageSeconds=age, overdue=overdue,
                enqueueState=item.get('enqueueState'), attempts=attempts, eligible=eligible)


def main():
    cli = parser(__doc__)
    cli.add_argument('--namespace', choices=['flashrush-manual'])
    cli.add_argument('--inventory', type=Path, help='Explicit manual/lab resource inventory; never infer names')
    cli.add_argument('--output', type=Path)
    actions = cli.add_mutually_exclusive_group()
    actions.add_argument('--resend', action='store_true')
    actions.add_argument('--recover', action='store_true', help='Process overdue orders using the same atomic Worker transaction, including SENT')
    cli.add_argument('--min-age-seconds', type=int, default=300,
                     help='Operational threshold, not an approved business SLA')
    args = cli.parse_args()
    if args.min_age_seconds < 30:
        cli.error('min-age-seconds must be >= 30')
    inventory = getattr(args, 'inventory', None)
    if args.namespace and not inventory:
        cli.error('INCOMPLETE_CONFIGURATION: manual recovery requires --inventory')
    config = load(inventory, 'runtime') if inventory else None
    if config:
        if args.namespace and config['target'] != 'manual':
            cli.error('INCOMPLETE_CONFIGURATION: namespace and inventory disagree')
        args.account, args.region = config['account'], config['region']
    session = connect(args)
    if config:
        outputs = config['resources']
    else:
        outputs = stack_outputs(session, args)
    validate_runtime(session, outputs, args.account, args.region, config['target'] if config else None)
    for name in ('CUSTOMERS_TABLE', 'BUSINESS_TABLE', 'CAMPAIGNS_TABLE', 'PRODUCTS_TABLE', 'ORDERS_TABLE', 'QUEUE_URL'):
        os.environ.pop(name, None)
    os.environ['CAMPAIGNS_TABLE'] = outputs['CampaignsTable']
    os.environ.update(PRODUCTS_TABLE=outputs['ProductsTable'], ORDERS_TABLE=outputs['OrdersTable'], QUEUE_URL=outputs['QueueUrl'])
    if outputs.get('CustomersTable'):
        os.environ['CUSTOMERS_TABLE'] = outputs['CustomersTable']
    if outputs.get('BusinessTable'):
        os.environ['BUSINESS_TABLE'] = outputs['BusinessTable']
    boto3.DEFAULT_SESSION = session
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
    import app
    importlib.reload(app)
    kwargs, pending = {}, []
    while True:
        page = app.orders.scan(**kwargs)
        pending.extend(i for i in page['Items'] if i['status'] == 'PENDING')
        if 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']
    unresolved = 0
    reports = []
    groups = {}
    for item in pending:
        report = inspect(item, time.time(), args.min_age_seconds)
        report['action'] = 'investigate' if report['overdue'] else 'wait'
        if item.get('ownerId'):
            group_key = (item['ownerId'], item.get('checkoutId'))
            if (args.resend or args.recover) and report['overdue'] and report['ageSeconds'] is not None:
                if group_key not in groups:
                    try:
                        import customer
                        if not group_key[1]:
                            raise ValueError('Missing checkoutId')
                        group = customer.read(group_key[0], 'CHECKOUT#' + group_key[1])
                        if not group:
                            raise ValueError('Missing checkout group')
                        if args.recover:
                            customer.process_checkout({'userId': group_key[0], 'checkoutId': group_key[1]})
                            groups[group_key] = {'action': 'recovery_attempted'}
                        else:
                            customer.enqueue_checkout(group)
                            groups[group_key] = {'action': 'enqueue_attempted'}
                    except Exception as exc:
                        groups[group_key] = {'action': 'retry_required', 'errorType': type(exc).__name__}
                report.update(groups[group_key])
            try:
                current = app.read_order(item['orderId'])
                report['status'] = current['status'] if current else 'MISSING'
            except Exception as exc:
                report.update(status='UNKNOWN', errorType=type(exc).__name__)
            unresolved += int(report['overdue'] and report['status'] not in ('CONFIRMED', 'OUT_OF_STOCK', 'FAILED'))
            reports.append(report)
            print(json.dumps(report))
            continue
        if args.resend and report['eligible']:
            try:
                report['action'] = 'enqueue_attempted' if app.enqueue(item) else 'unresolved'
            except Exception as exc:
                report.update(action='retry_required', errorType=type(exc).__name__)
        if args.recover and report['overdue'] and report['ageSeconds'] is not None:
            try:
                if isinstance(item['quantity'], bool) or item['quantity'] != int(item['quantity']) or not 1 <= int(item['quantity']) <= app.MAX_QUANTITY:
                    raise ValueError('Invalid quantity')
                app.process({'schemaVersion': '1.0', **{k: item[k] for k in ('orderId', 'productId', 'quantity')}})
                report['action'] = 'recovery_attempted'
            except Exception as exc:
                report['action'] = 'retry_required'
                report['errorType'] = type(exc).__name__
        # A successful resend is not proof of terminal completion. Rerun inspection.
        try:
            current = app.read_order(item['orderId'])
            report['status'] = current['status'] if current else 'MISSING'
        except Exception as exc:
            report.update(status='UNKNOWN', errorType=type(exc).__name__)
        unresolved += int(report['overdue'] and report['status'] not in ('CONFIRMED', 'OUT_OF_STOCK', 'FAILED'))
        reports.append(report)
        print(json.dumps(report))
    summary = dict(pendingCount=len(pending), groupsAttempted=len(groups), overdueUnresolved=unresolved, dryRun=not (args.resend or args.recover), orders=reports)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary))
    return 2 if unresolved else 0


if __name__ == '__main__':
    raise SystemExit(main())
