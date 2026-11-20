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
    attempts = int(item.get('enqueueAttemptCount', 0))
    overdue = age is None or age >= min_age
    eligible = overdue and age is not None and item.get('enqueueState') != 'SENT' and item.get('enqueueLeaseUntil', 0) < epoch and attempts < 3
    return dict(orderId=item['orderId'], ageSeconds=age, overdue=overdue,
                enqueueState=item.get('enqueueState'), attempts=attempts, eligible=eligible)


def main():
    cli = parser(__doc__)
    cli.add_argument('--resend', action='store_true')
    cli.add_argument('--min-age-seconds', type=int, default=300,
                     help='Operational threshold, not an approved business SLA')
    args = cli.parse_args()
    if args.min_age_seconds < 30:
        cli.error('min-age-seconds must be >= 30')
    session = connect(args)
    outputs = stack_outputs(session, args)
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
    for item in pending:
        report = inspect(item, time.time(), args.min_age_seconds)
        report['action'] = 'investigate' if report['overdue'] else 'wait'
        if args.resend and report['eligible']:
            report['action'] = 'enqueued' if app.enqueue(item) else 'unresolved'
        # A successful resend is not proof of terminal completion. Rerun inspection.
        current = app.read_order(item['orderId'])
        unresolved += int(report['overdue'] and current['status'] == 'PENDING')
        print(json.dumps(report))
    print(json.dumps(dict(pendingCount=len(pending), overdueUnresolved=unresolved, dryRun=not args.resend)))
    return 2 if unresolved else 0


if __name__ == '__main__':
    raise SystemExit(main())
