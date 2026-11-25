"""FLASHRUSH lab API and idempotent SQS worker (Python 3.12).

https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

db = boto3.resource('dynamodb')
products = db.Table(os.environ['PRODUCTS_TABLE'])
orders = db.Table(os.environ['ORDERS_TABLE'])
campaigns = db.Table(os.environ['CAMPAIGNS_TABLE'])
ddb = boto3.client('dynamodb')
sqs = boto3.client('sqs')
serializer = TypeSerializer()
log = logging.getLogger()
log.setLevel(logging.INFO)
TERMINAL = {'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'}


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def values(data):
    return {k: serializer.serialize(v) for k, v in data.items()}


def response(status, body):
    return {'statusCode': status, 'headers': {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
            'body': json.dumps(body, default=lambda v: int(v) if isinstance(v, Decimal) and v == int(v) else float(v))}


def error(status, code, retryable=False):
    return response(status, {'error': {'code': code, 'message': code, 'retryable': retryable}})


def read_order(order_id):
    return orders.get_item(Key={'orderId': order_id}, ConsistentRead=True).get('Item')


def public_order(item):
    return {k: item[k] for k in ('orderId', 'productId', 'quantity', 'status', 'createdAt', 'updatedAt')}


def parse_time(value):
    if not isinstance(value, str):
        raise ValueError('Invalid campaign time')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Campaign time must include timezone')
    return parsed.astimezone(timezone.utc)


def campaign_status(item, current=None):
    current = current or datetime.now(timezone.utc)
    start, end = parse_time(item['startTime']), parse_time(item['endTime'])
    if current < start:
        return 'UPCOMING'
    if current > end:
        return 'ENDED'
    return 'ACTIVE'


def sale_status(start, end, current, sold_out=False):
    if sold_out:
        return 'SOLD_OUT'
    if current < parse_time(start):
        return 'UPCOMING'
    if current > parse_time(end):
        return 'ENDED'
    return 'LIVE'


def campaign_products(item):
    return [products.get_item(Key={'productId': pid}).get('Item')
            for pid in item.get('productIds', [])]


def public_campaign(item, current=None):
    current = current or datetime.now(timezone.utc)
    stock_items = campaign_products(item)
    sold_out = bool(stock_items) and all(not product or product.get('stock', 0) <= 0 for product in stock_items)
    status = campaign_status(item, current)
    return {**item, 'status': status, 'serverTime': current.isoformat(),
            'saleStartsAt': parse_time(item['startTime']).isoformat(),
            'saleEndsAt': parse_time(item['endTime']).isoformat(),
            'saleStatus': sale_status(item['startTime'], item['endTime'], current, sold_out)}


def public_product(item, current=None, campaign_items=None):
    current = current or datetime.now(timezone.utc)
    campaign_items = campaign_items if campaign_items is not None else read_campaign_items()
    matches = [campaign for campaign in campaign_items
               if item['productId'] in campaign.get('productIds', [])]
    if matches:
        # Prefer the live window, otherwise the next sale, then the most recent one.
        matches.sort(key=lambda campaign: (campaign_status(campaign, current) != 'ACTIVE',
                                            parse_time(campaign['startTime'])))
        sale = matches[0]
        start, end = sale['startTime'], sale['endTime']
    else:
        start = item.get('saleStartsAt', item.get('saleEndsAt'))
        end = item.get('saleEndsAt')
        if not start or not end:
            start = end = current.isoformat()
    return {**item, 'serverTime': current.isoformat(),
            'saleStartsAt': parse_time(start).isoformat(), 'saleEndsAt': parse_time(end).isoformat(),
            'saleStatus': sale_status(start, end, current, item.get('stock', 0) <= 0)}


def read_campaign_items():
    items, kwargs = [], {}
    while True:
        page = campaigns.scan(**kwargs)
        items.extend(page['Items'])
        if 'LastEvaluatedKey' not in page:
            return items
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']


def campaign_payload(payload, current=None):
    if not isinstance(payload, dict):
        raise ValueError('Invalid campaign')
    name = payload.get('name')
    start_time, end_time = payload.get('startTime'), payload.get('endTime')
    product_ids = payload.get('productIds')
    max_qty = payload.get('maxQtyPerOrder')
    start, end = parse_time(start_time), parse_time(end_time)
    if (not isinstance(name, str) or not name.strip() or len(name) > 160 or start >= end or
            not isinstance(product_ids, list) or not product_ids or
            any(not isinstance(pid, str) or not pid or len(pid) > 128 for pid in product_ids) or
            len(set(product_ids)) != len(product_ids) or type(max_qty) is not int or max_qty < 1):
        raise ValueError('Invalid campaign')
    record = {'name': name.strip(), 'startTime': start.isoformat(), 'endTime': end.isoformat(),
              'productIds': product_ids, 'maxQtyPerOrder': max_qty}
    record['status'] = campaign_status(record, current)
    return record


def active_campaign_limit(product_id, quantity, current=None, product=None):
    current = current or datetime.now(timezone.utc)
    matching = [item for item in read_campaign_items() if product_id in item.get('productIds', [])]
    active = [item for item in matching if campaign_status(item, current) == 'ACTIVE']
    if not active:
        if matching and any(parse_time(item['startTime']) > current for item in matching):
            return 'SALE_NOT_ACTIVE'
        if not matching and product:
            start, end = product.get('saleStartsAt'), product.get('saleEndsAt')
            if start and end:
                state = sale_status(start, end, current, product.get('stock', 0) <= 0)
                if state == 'UPCOMING':
                    return 'SALE_NOT_ACTIVE'
                if state == 'ENDED':
                    return 'SALE_ENDED'
                if state == 'SOLD_OUT':
                    return 'SALE_SOLD_OUT'
        return 'SALE_ENDED'
    if any(quantity > item['maxQtyPerOrder'] for item in active):
        return 'CAMPAIGN_QUANTITY_LIMIT'
    return None


def enqueue(item):
    """Conditional lease prevents concurrent sends; duplicate delivery remains safe."""
    if item['status'] in TERMINAL or item.get('enqueueState') == 'SENT':
        return True
    lease_owner = str(uuid.uuid4())
    epoch = int(time.time())
    try:
        orders.update_item(Key={'orderId': item['orderId']},
            UpdateExpression='SET enqueueState=:sending, enqueueLeaseUntil=:until, leaseOwner=:owner ADD enqueueAttemptCount :one',
            ConditionExpression='#s=:pending AND (attribute_not_exists(enqueueLeaseUntil) OR enqueueLeaseUntil < :now) AND enqueueState <> :sent AND enqueueAttemptCount < :max',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={':sending': 'SENDING', ':until': epoch+30, ':owner': lease_owner,
                ':one': 1, ':pending': 'PENDING', ':now': epoch, ':sent': 'SENT', ':max': 3})
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
        current = read_order(item['orderId'])
        return current['status'] in TERMINAL or current.get('enqueueState') == 'SENT'
    message = {k: item[k] for k in ('orderId', 'productId', 'quantity', 'correlationId')}
    message['schemaVersion'] = '1.0'
    try:
        sqs.send_message(QueueUrl=os.environ['QUEUE_URL'], MessageBody=json.dumps(message, default=int))
    except Exception:
        # Includes ambiguous transport failure: resend only after lease/reconciliation.
        orders.update_item(Key={'orderId': item['orderId']},
            UpdateExpression='SET enqueueState=:state, updatedAt=:at',
            ConditionExpression='leaseOwner=:owner',
            ExpressionAttributeValues={':state': 'UNKNOWN', ':at': now(), ':owner': lease_owner})
        return False
    try:
        orders.update_item(Key={'orderId': item['orderId']},
            UpdateExpression='SET enqueueState=:sent, updatedAt=:at REMOVE enqueueLeaseUntil, leaseOwner',
            ConditionExpression='leaseOwner=:owner',
            ExpressionAttributeValues={':sent': 'SENT', ':at': now(), ':owner': lease_owner})
    except ClientError:
        log.warning('enqueue_ack_state_uncertain orderId=%s', item['orderId'])
    return True


def api(event, context):
    request_id = event.get('requestContext', {}).get('requestId') or getattr(context, 'aws_request_id', 'local')
    try:
        result = route(event)
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        result = error(400, 'INVALID_REQUEST')
    except Exception as exc:
        log.error('api_error type=%s requestId=%s', type(exc).__name__, request_id)
        result = error(503, 'SERVICE_UNAVAILABLE', True)
    result['headers']['X-Request-Id'] = request_id
    if result['statusCode'] >= 400:
        body = json.loads(result['body'])
        body['error']['requestId'] = request_id
        result['body'] = json.dumps(body)
    return result


def route(event):
    method = event['requestContext']['http']['method']
    path = event.get('rawPath', '/')
    headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
    if method == 'GET' and path == '/products':
        items, kwargs = [], {}
        while True:
            page = products.scan(**kwargs)
            items.extend(page['Items'])
            if 'LastEvaluatedKey' not in page:
                break
            kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']
        current = datetime.now(timezone.utc)
        campaign_items = read_campaign_items()
        return response(200, {'serverTime': current.isoformat(),
                              'items': [public_product(item, current, campaign_items) for item in items]})
    if method == 'GET' and path == '/campaigns':
        current = datetime.now(timezone.utc)
        items = [public_campaign(item, current) for item in read_campaign_items()]
        items.sort(key=lambda item: item['startTime'])
        return response(200, {'serverTime': current.isoformat(), 'items': items})
    if method == 'GET' and path.startswith('/campaigns/'):
        campaign_id = path.split('/')[-1]
        item = campaigns.get_item(Key={'campaignId': campaign_id}).get('Item')
        return response(200, public_campaign(item)) if item else error(404, 'CAMPAIGN_NOT_FOUND')
    if method == 'POST' and path == '/admin/campaigns':
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode()
        payload = json.loads(raw)
        record = campaign_payload(payload)
        campaign_id = payload.get('campaignId') or str(uuid.uuid4())
        if not isinstance(campaign_id, str) or not campaign_id or len(campaign_id) > 128:
            return error(400, 'INVALID_REQUEST')
        item = {'campaignId': campaign_id, **record}
        campaigns.put_item(Item=item, ConditionExpression='attribute_not_exists(campaignId)')
        return response(201, public_campaign(item))
    if method == 'PATCH' and path.startswith('/admin/campaigns/'):
        campaign_id = path.split('/')[-1]
        existing = campaigns.get_item(Key={'campaignId': campaign_id}, ConsistentRead=True).get('Item')
        if not existing:
            return error(404, 'CAMPAIGN_NOT_FOUND')
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode()
        changes = json.loads(raw)
        if not isinstance(changes, dict) or not changes or set(changes) - {
                'name', 'startTime', 'endTime', 'productIds', 'maxQtyPerOrder'}:
            return error(400, 'INVALID_REQUEST')
        merged = {**existing, **changes}
        record = campaign_payload(merged)
        item = {'campaignId': campaign_id, **record}
        campaigns.put_item(Item=item, ConditionExpression='attribute_exists(campaignId)')
        return response(200, public_campaign(item))
    if method == 'GET' and path.startswith('/products/'):
        item = products.get_item(Key={'productId': path.split('/')[-1]}).get('Item')
        return response(200, public_product(item)) if item else error(404, 'PRODUCT_NOT_FOUND')
    if method == 'GET' and path.startswith('/orders/'):
        item = read_order(path.split('/')[-1])
        token_hash = digest(headers.get('x-order-token', ''))
        if not item or not hmac.compare_digest(item['idempotencyKeyHash'], token_hash):
            return error(404, 'ORDER_NOT_FOUND')
        return response(200, public_order(item))
    if method != 'POST' or path != '/orders':
        return error(404, 'NOT_FOUND')
    key = headers.get('idempotency-key', '')
    try:
        parsed = uuid.UUID(key)
        if parsed.version != 4 or str(parsed) != key:
            raise ValueError()
    except ValueError:
        return error(400, 'INVALID_IDEMPOTENCY_KEY')
    raw = event.get('body') or '{}'
    if event.get('isBase64Encoded'):
        raw = base64.b64decode(raw).decode()
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return error(400, 'INVALID_REQUEST')
    pid, qty = payload.get('productId'), payload.get('quantity')
    if not isinstance(pid, str) or not pid or len(pid) > 128 or type(qty) is not int or qty < 1:
        return error(400, 'INVALID_REQUEST')
    payload_hash = digest(json.dumps({'productId': pid, 'quantity': qty}, sort_keys=True, separators=(',', ':')))
    oid = 'ord_' + digest('flashrush-demo:v1:' + key)[:32]
    item = read_order(oid)
    if not item:
        product = products.get_item(Key={'productId': pid}).get('Item')
        if not product:
            return error(404, 'PRODUCT_NOT_FOUND')
        if product.get('stock', 0) <= 0:
            return error(409, 'SALE_SOLD_OUT')
        current = datetime.now(timezone.utc)
        campaign_error = active_campaign_limit(pid, qty, current, product)
        if campaign_error:
            return error(409, campaign_error)
        item = {'orderId': oid, 'productId': pid, 'quantity': qty, 'status': 'PENDING',
                'idempotencyKeyHash': digest(key), 'payloadHash': payload_hash, 'createdAt': now(),
                'updatedAt': now(), 'enqueueState': 'NOT_SENT', 'enqueueAttemptCount': 0, 'correlationId': str(uuid.uuid4())}
        try:
            orders.put_item(Item=item, ConditionExpression='attribute_not_exists(orderId)')
        except ClientError as exc:
            if exc.response['Error']['Code'] != 'ConditionalCheckFailedException':
                raise
            item = read_order(oid)
    if item['payloadHash'] != payload_hash:
        return error(409, 'IDEMPOTENCY_PAYLOAD_CONFLICT')
    if item['status'] in TERMINAL:
        return response(200, public_order(item))
    if not enqueue(item):
        return error(503, 'ORDER_NOT_QUEUED_YET', True)
    return response(202, {**public_order(item), 'accepted': True, 'statusUrl': '/orders/' + oid})


def process(message):
    if message.get('schemaVersion') != '1.0':
        raise ValueError('Unsupported message')
    item = read_order(message['orderId'])
    if not item:
        raise ValueError('Missing order')
    if item['status'] in TERMINAL:
        log.info('worker_terminal_noop orderId=%s', item['orderId'])
        return
    if any(message.get(k) != item[k] for k in ('productId', 'quantity')):
        raise ValueError('Message mismatch')
    order_update = {'TableName': orders.name, 'Key': values({'orderId': item['orderId']}),
        'UpdateExpression': 'SET #s=:next, updatedAt=:at', 'ConditionExpression': '#s=:pending',
        'ExpressionAttributeNames': {'#s': 'status'},
        'ExpressionAttributeValues': values({':next': 'CONFIRMED', ':pending': 'PENDING', ':at': now()})}
    try:
        ddb.transact_write_items(TransactItems=[{'Update': {
            'TableName': products.name, 'Key': values({'productId': item['productId']}),
            'UpdateExpression': 'SET stock=stock-:qty', 'ConditionExpression': 'stock>=:qty',
            'ExpressionAttributeValues': values({':qty': item['quantity']})}}, {'Update': order_update}])
        return
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'TransactionCanceledException':
            raise
        if read_order(item['orderId'])['status'] in TERMINAL:
            return
        reasons = exc.response.get('CancellationReasons', [])
        if not reasons or reasons[0].get('Code') != 'ConditionalCheckFailed':
            raise
    # Stock shortage is verified atomically with the OOS transition.
    order_update['ExpressionAttributeValues'][':next'] = {'S': 'OUT_OF_STOCK'}
    ddb.transact_write_items(TransactItems=[{'ConditionCheck': {
        'TableName': products.name, 'Key': values({'productId': item['productId']}),
        'ConditionExpression': 'attribute_exists(productId) AND stock<:qty',
        'ExpressionAttributeValues': values({':qty': item['quantity']})}}, {'Update': order_update}])


def worker(event, context):
    failures = []
    for record in event['Records']:
        try:
            process(json.loads(record['body']))
        except Exception as exc:
            log.warning('worker_retry messageId=%s type=%s', record['messageId'], type(exc).__name__)
            failures.append({'itemIdentifier': record['messageId']})
    return {'batchItemFailures': failures}
