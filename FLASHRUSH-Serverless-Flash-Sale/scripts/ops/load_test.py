"""Isolated manual-lab load test, JSON/Markdown report; explicit --execute required."""
import argparse
import concurrent.futures
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import time
import urllib.request
import urllib.error
import uuid
import boto3


def evaluate(items, stock, initial, expected):
    confirmed = sum(int(i['quantity']) for i in items if i['status'] == 'CONFIRMED')
    return len(items) == expected and all(i['status'] in ('CONFIRMED', 'OUT_OF_STOCK') for i in items) and stock >= 0 and stock + confirmed == initial and (not any(i['status'] == 'OUT_OF_STOCK' for i in items) or stock < min(int(i['quantity']) for i in items if i['status'] == 'OUT_OF_STOCK'))


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    for name in ('profile', 'region', 'account'):
        cli.add_argument('--'+name, required=True)
    cli.add_argument('--requests', type=int, default=100)
    cli.add_argument('--concurrency', type=int, default=10)
    cli.add_argument('--stock', type=int, default=10)
    cli.add_argument('--quantity', type=int, default=1)
    cli.add_argument('--timeout', type=int, default=180)
    cli.add_argument('--execute', action='store_true')
    cli.add_argument('--output', type=Path, default=Path('.build/load-report.json'))
    a = cli.parse_args()
    if not (1 <= a.requests <= 1000 and 1 <= a.concurrency <= 20 and 1 <= a.quantity <= 100 and 0 <= a.stock <= 10000 and 1 <= a.timeout <= 1800):
        cli.error('Invalid bounds: requests1..1000, concurrency1..20, quantity1..100, stock0..10000, timeout1..1800')
    if not a.execute:
        print('Dry run. --execute creates one unique test SKU and sends orders; does not reset or delete existing data.')
        return 0
    session = boto3.Session(profile_name=a.profile, region_name=a.region)
    if session.client('sts').get_caller_identity()['Account'] != a.account:
        raise SystemExit('Account mismatch')
    apis = session.client('apigatewayv2').get_apis()['Items']
    matches = [x for x in apis if x['Name'] == 'flashrush-manual-api']
    if len(matches) != 1:
        raise SystemExit('Expected exactly one manual HTTP API')
    url = matches[0]['ApiEndpoint']
    db = session.resource('dynamodb')
    products, orders = db.Table('flashrush-manual-products'), db.Table('flashrush-manual-orders')
    for table in (products, orders):
        if table.table_arn.split(':')[3:5] != [a.region, a.account]:
            raise SystemExit('Table target mismatch')
    pid = 'load-test-'+str(uuid.uuid4())
    report = {'runId': pid, 'account': a.account, 'region': a.region, 'api': url, 'requests': a.requests,
              'maxClientWorkers': a.concurrency, 'quantity': a.quantity, 'initialStock': a.stock,
              'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'FAILED', 'checks': {}}
    started = time.monotonic()
    def submit(key):
        codes, latency = [], []
        for attempt in range(20):
            req = urllib.request.Request(url+'/orders', method='POST', headers={'Content-Type':'application/json','Idempotency-Key':key}, data=json.dumps({'productId':pid,'quantity':a.quantity}).encode())
            t = time.monotonic()
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    code, body = res.status, json.load(res)
            except urllib.error.HTTPError as exc:
                code, body = exc.code, {}
            except (OSError, TimeoutError):
                code, body = 0, {}
            codes.append(code); latency.append((time.monotonic()-t)*1000)
            if code in (200,202) and body.get('orderId'):
                return {'orderId':body['orderId'],'codes':codes,'latencyMs':latency}
            if code not in (0,429,500,502,503,504): break
            time.sleep(min(.25*2**min(attempt,4),4))
        return {'codes':codes,'latencyMs':latency}
    try:
        products.put_item(Item={'productId':pid,'name':'Load test','description':'Isolated fixture','category':'Lab','price':1,'originalPrice':2,'stock':a.stock,'initialStock':a.stock,'images':['/images/headphones.jpg'],'isFlashSale':True,'saleEndsAt':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()}, ConditionExpression='attribute_not_exists(productId)')
        session.resource('dynamodb').Table('flashrush-manual-campaigns').put_item(Item={
            'campaignId':pid, 'name':'Isolated load fixture',
            'startTime':(datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat(),
            'endTime':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),
            'status':'ACTIVE', 'productIds':[pid], 'maxQtyPerOrder':100},
            ConditionExpression='attribute_not_exists(campaignId)')
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.concurrency) as pool:
            results = list(pool.map(submit,[str(uuid.uuid4()) for _ in range(a.requests)]))
        accepted = [x['orderId'] for x in results if 'orderId' in x]
        end = time.monotonic()+a.timeout
        items = []
        while True:
            items = [orders.get_item(Key={'orderId':oid},ConsistentRead=True).get('Item') for oid in accepted]
            if all(i and i['status'] in ('CONFIRMED','OUT_OF_STOCK','FAILED') for i in items) or time.monotonic() >= end: break
            time.sleep(2)
        items = [i for i in items if i]
        stock = int(products.get_item(Key={'productId':pid},ConsistentRead=True)['Item']['stock'])
        latencies = sorted(v for x in results for v in x['latencyMs'])
        report.update(accepted=len(accepted), finalStock=stock, counts=dict(Counter(i['status'] for i in items)), httpCodes=dict(Counter(c for x in results for c in x['codes'])),
                      requestLatencyMs={f'p{q}':latencies[min(len(latencies)-1,int(len(latencies)*q/100))] for q in (50,95,99)}, orders=[{'orderId':i['orderId'],'quantity':int(i['quantity']),'status':i['status']} for i in items])
        report['checks'] = {'uniqueOrders':len(set(accepted))==a.requests, 'terminalAndStockConservation':evaluate(items,stock,a.stock,a.requests)}
        report['status'] = 'PASS' if all(report['checks'].values()) else 'FAIL'
    except Exception as exc:
        report['errorType'] = type(exc).__name__
    finally:
        report['elapsedSeconds'] = round(time.monotonic()-started,3)
        a.output.parent.mkdir(parents=True,exist_ok=True)
        a.output.write_text(json.dumps(report,indent=2),encoding='utf-8')
        a.output.with_suffix('.md').write_text('# FLASHRUSH load report\n\n'+ '\n'.join(f'- {k}: {json.dumps(v)}' for k,v in report.items() if k != 'orders')+'\n\nClient workers are a concurrency limit, not proof all requests started simultaneously. HTTP 202 is intake only. Fixture and orders retained for evidence.\n',encoding='utf-8')
    print(report['status'],str(a.output))
    return 0 if report['status']=='PASS' else 2

if __name__ == '__main__':
    raise SystemExit(main())
