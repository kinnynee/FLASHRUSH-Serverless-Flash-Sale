"""Live isolated 100/10 test. Seeds a unique test SKU, preserves evidence, never resets existing stock."""
import concurrent.futures
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

import boto3

root = Path(__file__).resolve().parents[2]
session = boto3.Session(profile_name='dropit-admin', region_name='us-east-1')
outputs = {o['OutputKey']: o['OutputValue'] for o in session.client('cloudformation').describe_stacks(StackName='flashrush-lab')['Stacks'][0]['Outputs']}
(root/'.build/outputs.json').write_text(json.dumps(outputs, indent=2), encoding='utf-8')
db = session.resource('dynamodb')
products = db.Table(outputs['ProductsTable'])
orders = db.Table(outputs['OrdersTable'])
run = str(uuid.uuid4())[:8]
pid = 'load-test-'+run
deadline = (datetime.now(timezone.utc)+timedelta(days=3)).isoformat()
product = {'productId': pid, 'name': 'FLASHRUSH concurrency test', 'description': 'Live AWS lab test product',
    'category': 'Lab', 'price': 199000, 'priceVnd': 199000, 'originalPrice': 299000,
    'stock': 10, 'initialStock': 10, 'images': ['/images/headphones.jpg'], 'isFlashSale': True, 'saleEndsAt': deadline}
products.put_item(Item=product, ConditionExpression='attribute_not_exists(productId)')


def request(method, path, key='', payload=None):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key' if method == 'POST' else 'X-Order-Token'] = key
    req = urllib.request.Request(outputs['ApiUrl']+path, headers=headers, method=method,
        data=json.dumps(payload).encode() if payload is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)
    except (TimeoutError, urllib.error.URLError):
        return 0, {}


def submit(key):
    codes = []
    for attempt in range(30):
        status, body = request('POST', '/orders', key, {'productId': pid, 'quantity': 1})
        codes.append(status)
        if status in (200, 202):
            return {'orderId': body['orderId'], 'codes': codes, 'key': key}
        if status not in (0, 429, 500, 503):
            break
        time.sleep(min(0.5+attempt*0.2, 3))
    return {'codes': codes, 'key': key}


start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results = list(pool.map(submit, [str(uuid.uuid4()) for _ in range(100)]))
accepted = [r for r in results if 'orderId' in r]
until = time.time()+180
items = []
while time.time() < until:
    items = [orders.get_item(Key={'orderId': r['orderId']}, ConsistentRead=True)['Item'] for r in accepted]
    if all(i['status'] in ('CONFIRMED', 'OUT_OF_STOCK', 'FAILED') for i in items):
        break
    time.sleep(2)
stock = int(products.get_item(Key={'productId': pid}, ConsistentRead=True)['Item']['stock'])
counts = {s: sum(i['status'] == s for i in items) for s in ('CONFIRMED', 'OUT_OF_STOCK', 'PENDING', 'FAILED')}
first = accepted[0] if accepted else None
checks = {}
if first:
    status, body = request('POST', '/orders', first['key'], {'productId': pid, 'quantity': 1})
    checks['replaySameOrder'] = status == 200 and body.get('orderId') == first['orderId']
    checks['missingTokenDenied'] = request('GET', '/orders/'+first['orderId'])[0] == 404
    checks['correctTokenAllowed'] = request('GET', '/orders/'+first['orderId'], first['key'])[0] == 200
    checks['payloadConflict'] = request('POST', '/orders', first['key'], {'productId': 'other', 'quantity': 1})[0] == 409
    confirmed = next((i for i in items if i['status'] == 'CONFIRMED'), None)
    if confirmed:
        session.client('sqs').send_message(QueueUrl=outputs['QueueUrl'], MessageBody=json.dumps({
            'schemaVersion': '1.0', **{k: confirmed[k] for k in ('orderId', 'productId', 'quantity')}} , default=int))
        time.sleep(5)
        checks['duplicateMessageNoDecrement'] = int(products.get_item(Key={'productId': pid}, ConsistentRead=True)['Item']['stock']) == stock
checks['catalogRead'] = request('GET', '/products')[0] == 200
report = {'timestamp': datetime.now(timezone.utc).isoformat(), 'region': 'us-east-1', 'runId': run, 'productId': pid,
    'submittedUnique': 100, 'acceptedUnique': len(accepted), 'terminal': sum(counts[s] for s in ('CONFIRMED', 'OUT_OF_STOCK', 'FAILED')),
    'states': counts, 'initialStock': 10, 'finalStock': stock, 'seconds': round(time.time()-start, 2),
    'httpAttempts': {str(c): sum(r['codes'].count(c) for r in results) for c in set(c for r in results for c in r['codes'])},
    'checks': checks, 'orderIds': [r['orderId'] for r in accepted]}
report['pass'] = len(accepted) == 100 and counts == {'CONFIRMED': 10, 'OUT_OF_STOCK': 90, 'PENDING': 0, 'FAILED': 0} and stock == 0 and all(checks.values())
target = root/'tests/evidence'/('aws-'+run+'.json')
target.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'orderIds'}, indent=2))
if not report['pass']:
    raise SystemExit('Live verification failed; inspect evidence')
