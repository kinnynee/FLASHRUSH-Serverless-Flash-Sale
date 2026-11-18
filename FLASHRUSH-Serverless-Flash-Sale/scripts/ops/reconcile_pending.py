"""Inspect pending orders; --resend only claims expired unsent leases. Never marks FAILED."""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import boto3

parser = argparse.ArgumentParser()
parser.add_argument('--profile', default='dropit-admin')
parser.add_argument('--region', default='us-east-1')
parser.add_argument('--resend', action='store_true')
args = parser.parse_args()
session = boto3.Session(profile_name=args.profile, region_name=args.region)
outputs = {o['OutputKey']: o['OutputValue'] for o in session.client('cloudformation').describe_stacks(StackName='flashrush-lab')['Stacks'][0]['Outputs']}
os.environ.update(PRODUCTS_TABLE=outputs['ProductsTable'], ORDERS_TABLE=outputs['OrdersTable'], QUEUE_URL=outputs['QueueUrl'])
boto3.DEFAULT_SESSION = session
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'backend'))
import app
kwargs = {}
pending = []
while True:
    page = app.orders.scan(**kwargs)
    pending.extend(i for i in page['Items'] if i['status'] == 'PENDING')
    if 'LastEvaluatedKey' not in page:
        break
    kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']
for item in pending:
    result = 'investigate'
    if args.resend and item.get('enqueueState') != 'SENT' and item.get('enqueueLeaseUntil', 0) < time.time():
        result = 'enqueued' if app.enqueue(item) else 'unresolved'
    print(json.dumps({'orderId': item['orderId'], 'enqueueState': item.get('enqueueState'), 'action': result}))
print(json.dumps({'pendingCount': len(pending)}))
