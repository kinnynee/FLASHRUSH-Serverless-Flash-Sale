"""Inspect pending orders; --resend only claims expired unsent leases. Never marks FAILED."""
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy'))
from lab_config import parser, connect, stack_outputs
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
    cli.add_argument('--output', type=Path)
    actions = cli.add_mutually_exclusive_group()
    actions.add_argument('--resend', action='store_true')
    actions.add_argument('--recover', action='store_true', help='Process overdue orders using the same atomic Worker transaction, including SENT')
    cli.add_argument('--min-age-seconds', type=int, default=300,
                     help='Operational threshold, not an approved business SLA')
    args = cli.parse_args()
    if args.min_age_seconds < 30:
        cli.error('min-age-seconds must be >= 30')
    session = connect(args)
    if args.namespace:
        prefix = args.namespace
        outputs = {'ProductsTable': prefix+'-products', 'OrdersTable': prefix+'-orders',
                   'QueueUrl': session.client('sqs').get_queue_url(QueueName=prefix+'-orders')['QueueUrl']}
        for name in ('ProductsTable', 'OrdersTable'):
            arn = session.client('dynamodb').describe_table(TableName=outputs[name])['Table']['TableArn']
            if arn.split(':')[3:5] != [args.region, args.account]:
                raise SystemExit('Table target mismatch')
    else:
        outputs = stack_outputs(session, args)
    os.environ['CAMPAIGNS_TABLE'] = (args.namespace+'-campaigns') if args.namespace else outputs['CampaignsTable']
    os.environ.update(PRODUCTS_TABLE=outputs['ProductsTable'], ORDERS_TABLE=outputs['OrdersTable'], QUEUE_URL=outputs['QueueUrl'])
    boto3.DEFAULT_SESSION = session
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
    import app
    kwargs, pending = {}, []
    while True:
        page = app.orders.scan(**kwargs)
        pending.extend(i for i in page['Items'] if i['status'] == 'PENDING')
        if 'LastEvaluatedKey' not in page:
            break
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']
    unresolved = 0
    reports = []
    for item in pending:
        report = inspect(item, time.time(), args.min_age_seconds)
        report['action'] = 'investigate' if report['overdue'] else 'wait'
        if args.resend and report['eligible']:
            report['action'] = 'enqueued' if app.enqueue(item) else 'unresolved'
        if args.recover and report['overdue'] and report['ageSeconds'] is not None:
            try:
                if isinstance(item['quantity'], bool) or item['quantity'] != int(item['quantity']) or not 1 <= int(item['quantity']) <= app.MAX_QUANTITY:
                    raise ValueError('Invalid quantity')
                app.process({'schemaVersion': '1.0', **{k: item[k] for k in ('orderId', 'productId', 'quantity')}})
                report['action'] = 'recovered'
            except Exception as exc:
                report['action'] = 'retry_required'
                report['errorType'] = type(exc).__name__
        # A successful resend is not proof of terminal completion. Rerun inspection.
        current = app.read_order(item['orderId'])
        unresolved += int(report['overdue'] and current['status'] == 'PENDING')
        reports.append(report)
        print(json.dumps(report))
    summary = dict(pendingCount=len(pending), overdueUnresolved=unresolved, dryRun=not (args.resend or args.recover), orders=reports)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary))
    return 2 if unresolved else 0


if __name__ == '__main__':
    raise SystemExit(main())
