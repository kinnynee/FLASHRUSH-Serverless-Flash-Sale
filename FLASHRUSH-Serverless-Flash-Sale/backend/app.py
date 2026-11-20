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
        return response(200, {'items': items})
    if method == 'GET' and path.startswith('/products/'):
        item = products.get_item(Key={'productId': path.split('/')[-1]}).get('Item')
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
        raw = base64.b64decode(raw).decode()
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        return error(400, 'INVALID_REQUEST')
    pid, qty = payload.get('productId'), payload.get('quantity')
    if not isinstance(pid, str) or not pid or len(pid) > 128 or type(qty) is not int or qty != 1:
        return error(400, 'INVALID_REQUEST')
    payload_hash = digest(json.dumps({'productId': pid, 'quantity': qty}, sort_keys=True, separators=(',', ':')))
    oid = 'ord_' + digest('flashrush-demo:v1:' + key)[:32]
    item = read_order(oid)
    if not item:
        if not products.get_item(Key={'productId': pid}).get('Item'):
            return error(404, 'PRODUCT_NOT_FOUND')
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
