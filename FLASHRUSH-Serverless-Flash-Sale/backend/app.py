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
MAX_QUANTITY = 100
TERMINAL = {'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'}
ADMIN_API_KEY = os.environ.get('ADMIN_API_KEY', '')
LOW_STOCK_THRESHOLD = 5


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
        # Keep the earliest live window; break ties independently of DynamoDB scan order.
        def priority(campaign):
            status = campaign_status(campaign, current)
            rank = {'ACTIVE': 0, 'UPCOMING': 1, 'ENDED': 2}[status]
            time = (-parse_time(campaign['endTime']).timestamp() if status == 'ENDED'
                    else parse_time(campaign['startTime']).timestamp())
            return rank, time, campaign['campaignId']

        sale = min(matches, key=priority)
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

def scan_all(table, **scan_kwargs):
    items, kwargs = [], dict(scan_kwargs)
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get('Items', []))
        if 'LastEvaluatedKey' not in page:
            return items
        kwargs['ExclusiveStartKey'] = page['LastEvaluatedKey']


def admin_order_record(item, product_map):
    product = product_map.get(item.get('productId'), {})
    if item.get('ownerId'):
        return {**public_order(item), 'unitPrice': item['unitPrice'], 'item': item['item']}
    unit_price = item.get('unitPrice', product.get('price', 0))
    return {**public_order(item), 'unitPrice': unit_price,
            'item': {'productId': item['productId'], 'name': product.get('name', item['productId']),
                     'image': (product.get('images') or [''])[0], 'quantity': item['quantity'],
                     'unitPrice': unit_price}}


def admin_overview_payload(current=None):
    product_items = scan_all(products)
    order_items = scan_all(orders)
    product_map = {item['productId']: item for item in product_items}
    counts = {status: 0 for status in ('PENDING', 'PROCESSING', 'CONFIRMED', 'OUT_OF_STOCK', 'FAILED')}
    revenue = 0
    for order in order_items:
        status = order.get('status')
        if status in counts:
            counts[status] += 1
        if status == 'CONFIRMED':
            price = order.get('unitPrice', product_map.get(order.get('productId'), {}).get('price', 0))
            revenue += order.get('totalAmount', price * order.get('quantity', 0))
    total = len(order_items)
    ordered = sorted(order_items, key=lambda item: (item.get('createdAt', ''), item['orderId']), reverse=True)
    return {'serverTime': (current or datetime.now(timezone.utc)).isoformat(), 'totalRevenue': revenue,
            'totalOrders': total, 'ordersByStatus': counts,
            'successRate': round(counts['CONFIRMED'] * 100 / total, 2) if total else 0,
            'lowStockProducts': [item for item in product_items if 0 < item.get('stock', 0) <= LOW_STOCK_THRESHOLD],
            'products': product_items,
            'recentOrders': [admin_order_record(item, product_map) for item in ordered[:10]]}


def admin_orders_page(query):
    status = query.get('status', '')
    if status and status not in {'PENDING', 'PROCESSING', 'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'}:
        return None
    try:
        limit = min(100, max(1, int(query.get('limit', '25'))))
        requested_page = int(query.get('page', '1'))
        if requested_page < 1:
            return None
    except (ValueError, TypeError):
        return None
    product_map = {item['productId']: item for item in scan_all(products)}
    found = scan_all(orders)
    if status:
        found = [item for item in found if item.get('status') == status]
    found.sort(key=lambda item: (item.get('createdAt', ''), item['orderId']), reverse=True)
    cursor = query.get('cursor')
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)))
            found = [item for item in found if (item.get('createdAt', ''), item['orderId']) <
                     (decoded['createdAt'], decoded['orderId'])]
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            return None
    total_count = len(found)
    total_pages = (total_count + limit - 1) // limit
    current_page = min(requested_page, total_pages) if total_pages else 1
    start_index = (current_page - 1) * limit
    page_items = found[:limit] if cursor else found[start_index:start_index + limit]
    next_cursor = None
    has_more = len(found) > limit if cursor else start_index + limit < total_count
    if has_more and page_items:
        last = page_items[-1]
        next_cursor = base64.urlsafe_b64encode(json.dumps(
            {'createdAt': last.get('createdAt', ''), 'orderId': last['orderId']}).encode()).decode().rstrip('=')
    return {'items': [admin_order_record(item, product_map) for item in page_items], 'nextCursor': next_cursor,
            'page': current_page, 'totalPages': total_pages, 'totalCount': total_count}


def validate_admin_product(payload, existing=None):
    if not isinstance(payload, dict):
        raise ValueError('Invalid product')
    allowed = {'productId', 'name', 'description', 'category', 'price', 'originalPrice', 'stock',
               'initialStock', 'images', 'isFlashSale', 'saleStartsAt', 'saleEndsAt', 'colors', 'specs'}
    if set(payload) - allowed:
        raise ValueError('Invalid product fields')
    result = {**(existing or {}), **payload}
    for field in ('productId', 'name', 'description', 'category'):
        if not isinstance(result.get(field), str) or not result[field].strip() or len(result[field]) > 2000:
            raise ValueError('Invalid product')
    for field in ('price', 'originalPrice'):
        if type(result.get(field)) not in (int, float, Decimal) or result[field] < 0:
            raise ValueError('Invalid product')
    if (type(result.get('stock')) not in (int, Decimal) or result['stock'] < 0 or result['stock'] % 1 != 0 or
            type(result.get('initialStock')) not in (int, Decimal) or result['initialStock'] < 0 or result['initialStock'] % 1 != 0 or
            type(result.get('isFlashSale')) is not bool or
            not isinstance(result.get('images'), list) or not result['images'] or
            any(not isinstance(image, str) or not image for image in result['images'])):
        raise ValueError('Invalid product')
    if result.get('saleStartsAt') is not None:
        parse_time(result['saleStartsAt'])
    parse_time(result['saleEndsAt'])
    return result

def route(event):
    method = event['requestContext']['http']['method']
    path = event.get('rawPath', '/')
    headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
    if path.startswith('/me/'):
        from customer import route as customer_route
        return customer_route(event)
    if path.startswith('/admin/'):
        if not ADMIN_API_KEY:
            return error(503, 'ADMIN_AUTH_NOT_CONFIGURED')
        supplied = headers.get('x-admin-key', '')
        if not hmac.compare_digest(supplied, ADMIN_API_KEY):
            return error(401, 'ADMIN_UNAUTHORIZED')
    if method == 'GET' and path == '/admin/overview':
        return response(200, admin_overview_payload())
    if method == 'GET' and path == '/admin/monitoring':
        from monitoring import snapshot
        minutes = (event.get('queryStringParameters') or {}).get('minutes', '60')
        if minutes not in ('15', '60', '180'):
            return error(400, 'INVALID_MONITORING_WINDOW')
        try:
            return response(200, snapshot(int(minutes)))
        except ValueError:
            return error(503, 'MONITORING_NOT_CONFIGURED')
        except Exception:
            log.exception('CloudWatch monitoring request failed')
            return error(503, 'CLOUDWATCH_UNAVAILABLE', True)
    if method == 'GET' and path == '/admin/orders':
        query = event.get('queryStringParameters') or {}
        result = admin_orders_page(query)
        return response(200, result) if result is not None else error(400, 'INVALID_ADMIN_ORDER_QUERY')
    if method == 'POST' and path == '/admin/products':
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode()
        payload = json.loads(raw)
        product_id = payload.get('productId') if isinstance(payload, dict) else None
        if not isinstance(product_id, str) or not product_id.strip() or len(product_id) > 128:
            return error(400, 'INVALID_PRODUCT')
        item = validate_admin_product(payload)
        item['productId'] = product_id.strip()
        try:
            products.put_item(Item=item, ConditionExpression='attribute_not_exists(productId)')
        except ClientError as exc:
            if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return error(409, 'PRODUCT_ALREADY_EXISTS')
            raise
        return response(201, public_product(item))
    if method == 'PATCH' and path.startswith('/admin/products/'):
        product_id = path.split('/')[-1]
        existing = products.get_item(Key={'productId': product_id}, ConsistentRead=True).get('Item')
        if not existing:
            return error(404, 'PRODUCT_NOT_FOUND')
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode()
        changes = json.loads(raw)
        if not isinstance(changes, dict) or not changes or 'stock' in changes or 'productId' in changes:
            return error(400, 'INVALID_PRODUCT')
        stock_delta = changes.pop('stockDelta', None)
        if stock_delta is not None and (type(stock_delta) is not int or stock_delta == 0):
            return error(400, 'INVALID_STOCK_DELTA')
        candidate = validate_admin_product({**changes, 'stock': existing['stock']}, existing)
        mutable = {key: value for key, value in candidate.items()
                   if key in changes and key not in ('productId', 'stock')}
        update_parts, names, expression_values = [], {}, {}
        for index, (key, value) in enumerate(mutable.items()):
            name, token = f'#f{index}', f':v{index}'
            names[name] = key
            expression_values[token] = value
            update_parts.append(f'{name}={token}')
        expression = ('SET ' + ', '.join(update_parts) if update_parts else '')
        if stock_delta is not None:
            expression += (' ' if expression else '') + 'ADD #stock :delta'
            names['#stock'] = 'stock'
            expression_values[':delta'] = stock_delta
        condition = 'attribute_exists(productId)'
        if stock_delta is not None and stock_delta < 0:
            condition += ' AND stock >= :minimum'
            expression_values[':minimum'] = abs(stock_delta)
        try:
            result = products.update_item(Key={'productId': product_id}, UpdateExpression=expression,
                ConditionExpression=condition, ExpressionAttributeNames=names,
                ExpressionAttributeValues=expression_values, ReturnValues='ALL_NEW')
        except ClientError as exc:
            if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return error(409, 'INSUFFICIENT_STOCK')
            raise
        return response(200, public_product(result['Attributes']))
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
    if method == 'DELETE' and path.startswith('/admin/campaigns/'):
        campaign_id = path.split('/')[-1]
        if not campaign_id:
            return error(400, 'INVALID_CAMPAIGN_ID')
        try:
            campaigns.delete_item(Key={'campaignId': campaign_id},
                                   ConditionExpression='attribute_exists(campaignId)')
        except ClientError as exc:
            if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                return error(404, 'CAMPAIGN_NOT_FOUND')
            raise
        return response(200, {'campaignId': campaign_id, 'deleted': True,
                              'serverTime': datetime.now(timezone.utc).isoformat()})
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
        if not item or item.get('ownerId') or not hmac.compare_digest(item['idempotencyKeyHash'], token_hash):
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
    if not isinstance(pid, str) or not pid or len(pid) > 128 or type(qty) is not int or not 1 <= qty <= MAX_QUANTITY:
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
        item = {'orderId': oid, 'productId': pid, 'quantity': qty, 'unitPrice': product['price'], 'status': 'PENDING',
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
    if message.get('schemaVersion') == '2.0':
        from customer import process_checkout
        return process_checkout(message)
    if message.get('schemaVersion') != '1.0':
        raise ValueError('Unsupported message')
    item = read_order(message['orderId'])
    if not item:
        raise ValueError('Missing order')
    if item.get('ownerId'):
        raise ValueError('Customer orders require atomic checkout processing')
    if item['status'] in TERMINAL:
        log.info('worker_terminal_noop orderId=%s', item['orderId'])
        return
    if any(message.get(k) != item[k] for k in ('productId', 'quantity')):
        raise ValueError('Message mismatch')
    if isinstance(item['quantity'], bool) or item['quantity'] != int(item['quantity']) or not 1 <= item['quantity'] <= MAX_QUANTITY:
        raise ValueError('Invalid quantity')
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
