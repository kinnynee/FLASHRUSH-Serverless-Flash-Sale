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
campaigns = db.Table(os.environ['CAMPAIGNS_TABLE']) if os.environ.get('CAMPAIGNS_TABLE') else None
ddb = boto3.client('dynamodb')
sqs = boto3.client('sqs')
serializer = TypeSerializer()
log = logging.getLogger()
log.setLevel(logging.INFO)
TERMINAL = {'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'}
MAX_CART_ITEMS = 20
MAX_REQUEST_BYTES = 16 * 1024
MAX_ORDER_BYTES = 64 * 1024
MAX_SAFE_INTEGER = 2**53 - 1


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


def order_lines(item):
    if 'items' in item:
        return item['items']
    return [{key: item[key] for key in ('productId', 'quantity')}]


def public_order(item):
    fields = ('orderId', 'productId', 'quantity', 'status', 'createdAt', 'updatedAt',
              'confirmedAt', 'subtotal', 'discountAmount', 'totalAmount', 'failureReason')
    line_fields = ('productId', 'name', 'image', 'quantity', 'unitPrice', 'subtotal')
    lines = [{key: line[key] for key in line_fields if key in line} for line in order_lines(item)]
    return {**{key: item[key] for key in fields if key in item}, 'items': lines,
            'totalQuantity': sum(line['quantity'] for line in lines)}


def normalize_checkout(payload):
    if not isinstance(payload, dict):
        raise ValueError('Invalid checkout')
    if 'items' in payload and ('productId' in payload or 'quantity' in payload):
        raise ValueError('Ambiguous checkout')
    lines = payload.get('items', [payload])
    if not isinstance(lines, list) or not lines:
        raise ValueError('Empty or invalid checkout')
    quantities = {}
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError('Invalid order line')
        pid, qty = line.get('productId'), line.get('quantity')
        if (not isinstance(pid, str) or not pid.strip() or len(pid) > 128 or
                type(qty) is not int or not 0 < qty <= MAX_SAFE_INTEGER):
            raise ValueError('Invalid product or quantity')
        quantities[pid] = quantities.get(pid, 0) + qty
    if len(quantities) > MAX_CART_ITEMS or sum(quantities.values()) > MAX_SAFE_INTEGER:
        raise ValueError('Checkout exceeds limits')
    return [{'productId': pid, 'quantity': qty} for pid, qty in sorted(quantities.items())]


def integer_value(value):
    return isinstance(value, (int, Decimal)) and not isinstance(value, bool) and value == int(value)


def snapshot_line(line, product):
    price = product.get('price')
    stock = product.get('stock')
    name, images = product.get('name'), product.get('images', [])
    image = images[0] if isinstance(images, list) and images else None
    if (not integer_value(price) or not 0 <= price <= MAX_SAFE_INTEGER or
            not isinstance(name, str) or not name or not isinstance(image, str) or not image):
        raise RuntimeError('Invalid catalog pricing or display data')
    if not integer_value(stock) or stock < 0:
        raise RuntimeError('Invalid catalog stock')
    price = int(price)
    return {**line, 'name': name, 'image': image, 'unitPrice': price, 'subtotal': price * line['quantity']}


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


def public_campaign(item):
    return {**item, 'status': campaign_status(item)}


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


def active_campaign_limit(product_id, quantity, campaign_items, current):
    matching = [item for item in campaign_items if product_id in item.get('productIds', [])]
    active = [item for item in matching if campaign_status(item, current) == 'ACTIVE']
    if not active:
        return 'CAMPAIGN_NOT_ACTIVE'
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
    message = {k: item[k] for k in ('orderId', 'correlationId')}
    if 'productId' in item:
        message.update(schemaVersion='1.0', productId=item['productId'], quantity=item['quantity'])
    else:
        message['schemaVersion'] = '2.0'
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
        return response(200, {'items': items})
    if method == 'GET' and path == '/campaigns':
        items = [public_campaign(item) for item in read_campaign_items()]
        items.sort(key=lambda item: item['startTime'])
        return response(200, {'items': items})
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
        item = products.get_item(Key={'productId': path.split('/')[-1]}, ConsistentRead=True).get('Item')
        return response(200, item) if item else error(404, 'PRODUCT_NOT_FOUND')
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
        if len(raw) > 4 * ((MAX_REQUEST_BYTES + 2) // 3):
            return error(400, 'INVALID_REQUEST')
        raw = base64.b64decode(raw, validate=True).decode()
    if len(raw.encode()) > MAX_REQUEST_BYTES:
        return error(400, 'INVALID_REQUEST')
    lines = normalize_checkout(json.loads(raw))
    single = lines[0] if len(lines) == 1 else {}
    canonical = single or {'items': lines}
    payload_hash = digest(json.dumps(canonical, sort_keys=True, separators=(',', ':')))
    oid = 'ord_' + digest('flashrush-demo:v1:' + key)[:32]
    item = read_order(oid)
    if not item:
        catalog = [products.get_item(Key={'productId': line['productId']}, ConsistentRead=True).get('Item')
                   for line in lines]
        if any(product is None for product in catalog):
            return error(404, 'PRODUCT_NOT_FOUND')
        campaign_items = read_campaign_items()
        current = datetime.now(timezone.utc)
        for line in lines:
            campaign_error = active_campaign_limit(line['productId'], line['quantity'], campaign_items, current)
            if campaign_error:
                return error(409, campaign_error)
        snapshots = [snapshot_line(line, product) for line, product in zip(lines, catalog)]
        subtotal = sum(line['subtotal'] for line in snapshots)
        if subtotal > MAX_SAFE_INTEGER:
            return error(400, 'INVALID_REQUEST')
        timestamp = now()
        item = {'orderId': oid, **single, 'status': 'PENDING', 'items': snapshots,
                'totalQuantity': sum(line['quantity'] for line in lines),
                'subtotal': subtotal, 'discountAmount': 0, 'totalAmount': subtotal,
                'idempotencyKeyHash': digest(key), 'payloadHash': payload_hash, 'createdAt': timestamp,
                'updatedAt': timestamp, 'enqueueState': 'NOT_SENT', 'enqueueAttemptCount': 0,
                'correlationId': str(uuid.uuid4())}
        if len(json.dumps(values(item), ensure_ascii=False).encode()) > MAX_ORDER_BYTES:
            return error(400, 'ORDER_TOO_LARGE')
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


def order_transition(order_id, status, reason=None):
    expression = 'SET #s=:next, updatedAt=:at'
    parameters = {':next': status, ':pending': 'PENDING', ':at': now()}
    if status == 'CONFIRMED':
        expression += ', confirmedAt=:at'
    if reason:
        expression += ', failureReason=:reason'
        parameters[':reason'] = reason
    return {'Update': {'TableName': orders.name, 'Key': values({'orderId': order_id}),
        'UpdateExpression': expression, 'ConditionExpression': '#s=:pending',
        'ExpressionAttributeNames': {'#s': 'status'}, 'ExpressionAttributeValues': values(parameters)}}


def stock_failure(order_id, line):
    key = {'productId': line['productId']}
    product = products.get_item(Key=key, ConsistentRead=True).get('Item')
    stock = product.get('stock') if product else None
    status, reason = 'FAILED', 'INVALID_PRODUCT_STOCK'
    parameters = {}
    if not product:
        condition, reason = 'attribute_not_exists(productId)', 'PRODUCT_REMOVED'
    elif not isinstance(stock, (int, Decimal)) or isinstance(stock, bool):
        condition = 'attribute_exists(productId) AND (attribute_not_exists(stock) OR NOT attribute_type(stock, :numeric))'
        parameters[':numeric'] = 'N'
    elif not integer_value(stock) or stock < 0:
        condition = 'attribute_exists(productId) AND stock=:invalid'
        parameters[':invalid'] = stock
    elif stock < line['quantity']:
        status, reason = 'OUT_OF_STOCK', None
        condition = 'attribute_exists(productId) AND stock=:observed'
        parameters[':observed'] = stock
    else:
        return False
    check = {'TableName': products.name, 'Key': values(key), 'ConditionExpression': condition}
    if parameters:
        check['ExpressionAttributeValues'] = values(parameters)
    try:
        ddb.transact_write_items(TransactItems=[{'ConditionCheck': check}, order_transition(order_id, status, reason)])
    except ClientError as exc:
        if (exc.response['Error']['Code'] != 'TransactionCanceledException' or
                (read_order(order_id) or {}).get('status') not in TERMINAL):
            raise
    return True


def process(message):
    version = message.get('schemaVersion')
    if version not in ('1.0', '2.0'):
        raise ValueError('Unsupported message')
    item = read_order(message['orderId'])
    if not item:
        raise ValueError('Missing order')
    lines = order_lines(item)
    if version == '1.0':
        if (len(lines) != 1 or type(message.get('quantity')) is not int or
                any(message.get(key) != lines[0][key] for key in ('productId', 'quantity'))):
            raise ValueError('Message mismatch')
    elif len(lines) < 2 or 'correlationId' not in message:
        raise ValueError('Message mismatch')
    if 'correlationId' in message and message['correlationId'] != item['correlationId']:
        raise ValueError('Message correlation mismatch')
    if item['status'] in TERMINAL:
        log.info('worker_terminal_noop orderId=%s', item['orderId'])
        return
    quantities = {line['productId']: line['quantity'] for line in lines}
    if (not 0 < len(lines) <= MAX_CART_ITEMS or len(quantities) != len(lines) or
            any(not integer_value(qty) or not 0 < qty <= MAX_SAFE_INTEGER for qty in quantities.values())):
        raise ValueError('Invalid stored order lines')
    actions = [{'Update': {'TableName': products.name, 'Key': values({'productId': pid}),
        'UpdateExpression': 'SET stock=stock-:qty',
        'ConditionExpression': 'attribute_exists(productId) AND attribute_type(stock, :numeric) AND stock>=:qty',
        'ExpressionAttributeValues': values({':qty': qty, ':numeric': 'N'})}}
        for pid, qty in quantities.items()]
    actions.append(order_transition(item['orderId'], 'CONFIRMED'))
    try:
        ddb.transact_write_items(TransactItems=actions)
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'TransactionCanceledException':
            raise
        if (read_order(item['orderId']) or {}).get('status') in TERMINAL:
            return
        reasons = exc.response.get('CancellationReasons', [])
        if (len(reasons) != len(actions) or reasons[-1].get('Code') != 'None' or
                any(reason.get('Code') not in ('None', 'ConditionalCheckFailed') for reason in reasons)):
            raise
        for line, reason in zip(lines, reasons):
            if reason['Code'] == 'ConditionalCheckFailed' and stock_failure(item['orderId'], line):
                return
        raise


def worker(event, context):
    failures = []
    for record in event['Records']:
        try:
            process(json.loads(record['body']))
        except Exception as exc:
            log.warning('worker_retry messageId=%s type=%s', record['messageId'], type(exc).__name__)
            failures.append({'itemIdentifier': record['messageId']})
    return {'batchItemFailures': failures}
