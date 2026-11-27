"""Customer-owned data and atomic checkout groups. Identity comes from Cognito."""
import base64
import json
import os
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

import app


class Problem(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status


def table():
    return app.db.Table(os.environ['CUSTOMERS_TABLE'])


def key(user, sk):
    return {'userId': user, 'recordId': sk}


def read(user, sk):
    return table().get_item(Key=key(user, sk), ConsistentRead=True).get('Item')


def identity(event):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    if (not claims.get('sub') or claims.get('token_use') != 'access' or
            claims.get('client_id') != os.environ.get('CUSTOMER_CLIENT_ID') or
            claims.get('iss') != os.environ.get('CUSTOMER_ISSUER')):
        raise Problem('UNAUTHORIZED', 401)
    token = next((v[7:] for k, v in event.get('headers', {}).items()
                  if k.lower() == 'authorization' and v.startswith('Bearer ')), '')
    try:
        result = boto3.client('cognito-idp').get_user(AccessToken=token)
    except ClientError as exc:
        if exc.response['Error']['Code'] in ('NotAuthorizedException', 'UserNotFoundException'):
            raise Problem('UNAUTHORIZED', 401) from exc
        raise
    attributes = {a['Name']: a['Value'] for a in result['UserAttributes']}
    if attributes.get('sub') != claims['sub'] or attributes.get('email_verified') != 'true':
        raise Problem('UNAUTHORIZED', 401)
    return claims['sub'], attributes


def text(value, maximum, required=True):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise Problem('INVALID_REQUEST')
    return value.strip()


def integer(value, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise Problem('INVALID_REQUEST')
    return value


def version_condition(version):
    return 'attribute_not_exists(#v)' if version == 0 else '#v=:version'


def put_versioned(user, sk, payload, version):
    args = {'Item': {**key(user, sk), **payload, 'version': version + 1},
            'ConditionExpression': version_condition(version), 'ExpressionAttributeNames': {'#v': 'version'}}
    if version:
        args['ExpressionAttributeValues'] = {':version': version}
    try:
        table().put_item(**args)
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
            raise Problem('VERSION_CONFLICT', 409) from exc
        raise


def profile(user, attributes):
    record = read(user, 'PROFILE') or {'name': attributes.get('name', ''), 'phone': '', 'avatar': '',
                                      'addresses': [], 'defaultAddressId': '', 'version': 0}
    return {k: v for k, v in {**record, 'email': attributes.get('email', '')}.items()
            if k not in ('userId', 'recordId')}


def save_profile(user, payload):
    if set(payload) != {'name', 'phone', 'avatar', 'addresses', 'defaultAddressId', 'version'}:
        raise Problem('INVALID_REQUEST')
    name, phone = text(payload['name'], 100), text(payload['phone'], 20, False)
    if phone and (not phone.lstrip('+').isdigit() or len(phone) < 8):
        raise Problem('INVALID_PHONE')
    avatar = text(payload['avatar'], 2048, False)
    if avatar and (urlparse(avatar).scheme != 'https' or not urlparse(avatar).hostname):
        raise Problem('INVALID_AVATAR_URL')
    raw = payload['addresses']
    if not isinstance(raw, list) or len(raw) > 10:
        raise Problem('INVALID_ADDRESSES')
    addresses = []
    for address in raw:
        if not isinstance(address, dict) or set(address) != {'id', 'name', 'phone', 'street', 'ward', 'city'}:
            raise Problem('INVALID_ADDRESS')
        clean = {field: text(address[field], 200 if field == 'street' else 100) for field in address}
        if not clean['phone'].lstrip('+').isdigit() or not 8 <= len(clean['phone']) <= 20:
            raise Problem('INVALID_PHONE')
        addresses.append(clean)
    ids = [a['id'] for a in addresses]
    default = text(payload['defaultAddressId'], 100, False)
    if len(set(ids)) != len(ids) or (addresses and default not in ids) or (not addresses and default):
        raise Problem('INVALID_DEFAULT_ADDRESS')
    put_versioned(user, 'PROFILE', {'name': name, 'phone': phone, 'avatar': avatar,
                  'addresses': addresses, 'defaultAddressId': default}, integer(payload['version'], 0, 2147483647))


def cart_record(user):
    return read(user, 'CART') or {**key(user, 'CART'), 'version': 0, 'items': []}


def cart_view(user):
    cart = cart_record(user)
    items = []
    campaigns = app.read_campaign_items()
    for line in cart['items']:
        product = app.products.get_item(Key={'productId': line['productId']}, ConsistentRead=True).get('Item')
        shown = app.public_product(product, campaign_items=campaigns) if product else None
        issue = 'PRODUCT_NOT_FOUND' if not product else (
            'SALE_SOLD_OUT' if product['stock'] < line['quantity'] else
            app.active_campaign_limit(line['productId'], line['quantity'], product=product))
        items.append({**line, 'product': shown, 'issue': issue,
                      'priceChanged': bool(product and product['price'] != line['unitPrice'])})
    return {'version': cart['version'], 'items': items}


def save_cart(user, payload):
    if set(payload) != {'version', 'items'} or not isinstance(payload['items'], list) or len(payload['items']) > 30:
        raise Problem('INVALID_CART')
    lines, ids = [], set()
    previous_lines = cart_record(user)['items']
    for line in payload['items']:
        if not isinstance(line, dict) or set(line) != {'productId', 'quantity', 'color', 'unitPrice'}:
            raise Problem('INVALID_CART')
        pid = text(line['productId'], 128)
        color = text(line['color'], 100, False)
        qty = integer(line['quantity'], 1, app.MAX_QUANTITY)
        price = line['unitPrice']
        if type(price) not in (int, float) or not 0 <= price <= 10**12:
            raise Problem('INVALID_PRICE')
        product = app.products.get_item(Key={'productId': pid}, ConsistentRead=True).get('Item')
        previously_saved = any(line['productId'] == pid and line['color'] == color for line in previous_lines)
        if (not product and not previously_saved) or (product and color and color not in product.get('colors', []) and not previously_saved):
            raise Problem('PRODUCT_NOT_FOUND', 404)
        line_id = app.digest(pid + '\0' + color)[:24]
        if line_id in ids:
            raise Problem('DUPLICATE_CART_LINE')
        ids.add(line_id)
        lines.append({'lineId': line_id, 'productId': pid, 'quantity': qty, 'color': color, 'unitPrice': Decimal(str(price))})
    put_versioned(user, 'CART', {'items': lines}, integer(payload['version'], 0, 2147483647))


def order_view(item):
    return {**app.public_order(item), 'item': item['item'], 'checkoutId': item['checkoutId'],
            'address': item['address'], 'failureReason': item.get('failureReason'), 'unitPrice': item['unitPrice'], **{k:item[k] for k in ('subtotal','discount','totalAmount','voucherCode') if k in item}}


def owned_order(user, oid):
    item = app.read_order(oid)
    if not item or item.get('ownerId') != user:
        raise Problem('ORDER_NOT_FOUND', 404)
    return item


def order_list(user, query):
    args = {'KeyConditionExpression': Key('userId').eq(user) & Key('recordId').begins_with('ORDER#'),
            'ScanIndexForward': False, 'Limit': 25, 'ConsistentRead': True}
    cursor = query.get('cursor')
    if cursor:
        try:
            sk = base64.urlsafe_b64decode(cursor + '=' * (-len(cursor) % 4)).decode()
            if not sk.startswith('ORDER#') or len(sk) > 300:
                raise ValueError()
        except (ValueError, UnicodeError) as exc:
            raise Problem('INVALID_CURSOR') from exc
        args['ExclusiveStartKey'] = key(user, sk)
    page = table().query(**args)
    items = [order_view(owned_order(user, row['orderId'])) for row in page['Items']]
    last = page.get('LastEvaluatedKey')
    return {'items': items, 'nextCursor': base64.urlsafe_b64encode(last['recordId'].encode()).decode() if last else None}


def checkout_view(record):
    return {'checkoutId': record['recordId'][9:], 'status': record['status'],
            'pricing': record.get('pricing'), **{k:record[k] for k in ('subtotal','discount','totalAmount') if k in record},
            'orders': [order_view(owned_order(record['userId'], oid)) for oid in record['orderIds']]}


def enqueue_checkout(record):
    if record['status'] != 'PENDING' or record.get('enqueueState') == 'SENT':
        return
    owner = str(uuid.uuid4())
    try:
        table().update_item(Key=key(record['userId'], record['recordId']),
            UpdateExpression='SET leaseUntil=:until, leaseOwner=:owner',
            ConditionExpression='#s=:pending AND enqueueState<>:sent AND (attribute_not_exists(leaseUntil) OR leaseUntil<:now)',
            ExpressionAttributeNames={'#s': 'status'}, ExpressionAttributeValues={':until': int(time.time()) + 30,
                ':owner': owner, ':pending': 'PENDING', ':sent': 'SENT', ':now': int(time.time())})
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return
        raise
    app.sqs.send_message(QueueUrl=os.environ['QUEUE_URL'], MessageBody=json.dumps({
        'schemaVersion': '2.0', 'userId': record['userId'], 'checkoutId': record['recordId'][9:]}))
    table().update_item(Key=key(record['userId'], record['recordId']),
        UpdateExpression='SET enqueueState=:sent REMOVE leaseUntil, leaseOwner',
        ConditionExpression='leaseOwner=:owner', ExpressionAttributeValues={':sent': 'SENT', ':owner': owner})


def validate_lines(lines):
    campaign_items = app.read_campaign_items()
    current = datetime.now(timezone.utc)
    products, guards, quantities = {}, {}, {}
    for line in lines:
        pid = line['productId']
        quantities[pid] = quantities.get(pid, 0) + line['quantity']
        product = app.products.get_item(Key={'productId': pid}, ConsistentRead=True).get('Item')
        if not product:
            raise Problem('PRODUCT_NOT_FOUND', 409)
        if product['price'] != line['unitPrice']:
            raise Problem('PRICE_CHANGED', 409)
        if line['color'] and line['color'] not in product.get('colors', []):
            raise Problem('VARIANT_CHANGED', 409)
        products[pid] = product
    for pid, qty in quantities.items():
        if products[pid]['stock'] < qty:
            raise Problem('SALE_SOLD_OUT', 409)
        live = [c for c in campaign_items if pid in c.get('productIds', []) and app.campaign_status(c, current) == 'ACTIVE']
        if not live:
            raise Problem('SALE_ENDED', 409)
        if any(qty > c['maxQtyPerOrder'] for c in live):
            raise Problem('CAMPAIGN_QUANTITY_LIMIT', 409)
        for c in live:
            guards[c['campaignId']] = c
    if len(guards) > 30:
        raise Problem('TOO_MANY_SALE_WINDOWS', 409)
    return products, quantities, guards


def checkout_options():
    return {'shipping': [{'id': 'STANDARD', 'name': 'Giao hàng tiêu chuẩn', 'fee': 0}],
            'payments': [{'id': 'COD', 'name': 'Thanh toán khi nhận hàng (COD)'}],
            'voucher': {'code': 'HAUMON', 'minimum': 3600000, 'basisPoints': 3636}}


def selected_cart(user, payload):
    integer(payload.get('version'), 0, 2147483647)
    ids = payload.get('lineIds')
    if not isinstance(ids, list) or not 1 <= len(ids) <= 10 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        raise Problem('INVALID_SELECTION')
    cart = cart_record(user)
    if cart['version'] != payload['version']:
        raise Problem('VERSION_CONFLICT', 409)
    lines = [line for line in cart['items'] if line['lineId'] in ids]
    if len(lines) != len(ids):
        raise Problem('CART_CHANGED', 409)
    return cart, lines


def price_checkout(lines, products, payload, user=None):
    voucher = text(payload.get('voucherCode', ''), 32, False).upper()
    if payload.get('shippingMethod', 'STANDARD') != 'STANDARD':
        raise Problem('INVALID_SHIPPING_METHOD')
    if payload.get('paymentMethod', 'COD') != 'COD':
        raise Problem('INVALID_PAYMENT_METHOD')
    subtotal = sum(products[line['productId']]['price'] * line['quantity'] for line in lines)
    if voucher == 'HAUMON' and subtotal < 3600000:
        raise Problem('VOUCHER_MINIMUM_NOT_MET', 409)
    # Integer VND: round the total discount down, then allocate by cumulative value.
    discount = int(subtotal * 3636 // 10000) if voucher == 'HAUMON' else 0
    if voucher and voucher != 'HAUMON':
        from vouchers import quote, VoucherError
        try: discount=quote(voucher,user,subtotal)['discount']
        except VoucherError as exc: raise Problem(str(exc),409)
    return {'subtotal': subtotal, 'discount': discount, 'shippingFee': 0,
            'total': subtotal - discount, 'voucherCode': voucher,
            'shippingMethod': 'STANDARD', 'paymentMethod': 'COD',
            'quantity': sum(line['quantity'] for line in lines)}


def checkout_quote(user, payload):
    if set(payload) - {'version', 'lineIds', 'voucherCode', 'shippingMethod', 'paymentMethod'}:
        raise Problem('INVALID_CHECKOUT')
    _, lines = selected_cart(user, payload)
    products, _, _ = validate_lines(lines)
    return price_checkout(lines, products, payload, user)


def create_checkout(user, payload, headers):
    token = headers.get('idempotency-key', '')
    try:
        parsed = uuid.UUID(token)
        if parsed.version != 4 or str(parsed) != token:
            raise ValueError()
    except ValueError as exc:
        raise Problem('INVALID_IDEMPOTENCY_KEY') from exc
    if not {'version', 'lineIds', 'addressId'} <= set(payload) or set(payload) - {
            'version', 'lineIds', 'addressId', 'voucherCode', 'shippingMethod', 'paymentMethod', 'expectedTotal'}:
        raise Problem('INVALID_CHECKOUT')
    integer(payload['version'], 0, 2147483647)
    ids = payload['lineIds']
    if not isinstance(ids, list) or not 1 <= len(ids) <= 10 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        raise Problem('INVALID_SELECTION')
    address_id = text(payload['addressId'], 100)
    checkout_id = app.digest(user + ':' + token)[:32]
    sk = 'CHECKOUT#' + checkout_id
    fingerprint = app.digest(json.dumps(payload, sort_keys=True))
    record = read(user, sk)
    if record:
        if record['payloadHash'] != fingerprint:
            raise Problem('IDEMPOTENCY_PAYLOAD_CONFLICT', 409)
        enqueue_checkout(record)
        return checkout_view(record)
    cart, lines = selected_cart(user, payload)
    account = read(user, 'PROFILE') or {}
    address = next((a for a in account.get('addresses', []) if a['id'] == address_id), None)
    if not address:
        raise Problem('ADDRESS_REQUIRED', 409)
    product_map, _, _ = validate_lines(lines)
    pricing = price_checkout(lines, product_map, payload, user)
    if 'expectedTotal' in payload:
        integer(payload['expectedTotal'], 0, 10**15)
        if payload['expectedTotal'] != pricing['total']:
            raise Problem('QUOTE_CHANGED', 409)
    elif pricing['voucherCode']:
        raise Problem('QUOTE_REQUIRED', 409)
    voucher=None
    if pricing['voucherCode'] and pricing['voucherCode'] != 'HAUMON':
        from vouchers import quote, VoucherError
        try: voucher=quote(pricing['voucherCode'],user,pricing['subtotal'])
        except VoucherError as exc: raise Problem(str(exc),409)
        if voucher['discount'] != pricing['discount']: raise Problem('QUOTE_CHANGED',409)
    timestamp = app.now()
    order_ids, writes = [], []
    accumulated, allocated = 0, 0
    for line in lines:
        oid = 'ord_' + app.digest(user + ':' + token + ':' + line['lineId'])[:32]
        order_ids.append(oid)
        product = product_map[line['productId']]
        line_subtotal = product['price'] * line['quantity']
        accumulated += line_subtotal
        cumulative_discount = int(pricing['discount'] * accumulated // pricing['subtotal']) if pricing['subtotal'] else 0
        line_discount = cumulative_discount - allocated
        allocated = cumulative_discount
        item = {'productId': line['productId'], 'name': product['name'], 'image': product['images'][0],
                'quantity': line['quantity'], 'unitPrice': product['price'], 'selectedColor': line['color'],
                'discountAmount': line_discount, 'totalAmount': line_subtotal - line_discount,
                'voucherCode': pricing['voucherCode']}
        order = {'orderId': oid, 'ownerId': user, 'checkoutId': checkout_id, 'item': item, 'address': address,
                 'totalAmount': item['totalAmount'], 'paymentMethod': pricing['paymentMethod'],
                 'shippingMethod': pricing['shippingMethod'],
                 'productId': line['productId'], 'quantity': line['quantity'], 'unitPrice': product['price'],
                 'status': 'PENDING', 'createdAt': timestamp, 'updatedAt': timestamp, 'enqueueState': 'GROUP',
                 'idempotencyKeyHash': app.digest(user + ':' + token), 'payloadHash': fingerprint,
                 'correlationId': checkout_id}
        order.update(subtotal=line_subtotal,discount=line_discount,voucherCode=pricing['voucherCode'])
        writes.extend([{'Put': {'TableName': app.orders.name, 'Item': app.values(order), 'ConditionExpression': 'attribute_not_exists(orderId)'}},
                       {'Put': {'TableName': table().name, 'Item': app.values({**key(user, 'ORDER#'+timestamp+'#'+oid), 'orderId': oid})}}])
    record = {**key(user, sk), 'status': 'PENDING', 'enqueueState': 'NOT_SENT', 'createdAt': timestamp,
              'payloadHash': fingerprint, 'orderIds': order_ids, 'lines': lines, 'pricing': pricing, 'subtotal':pricing['subtotal'], 'discount':pricing['discount'], 'totalAmount':pricing['total'], **({'voucher':voucher} if voucher else {})}
    writes.extend([{'Put': {'TableName': table().name, 'Item': app.values(record), 'ConditionExpression': 'attribute_not_exists(recordId)'}},
                   {'Put': {'TableName': table().name, 'Item': app.values({**key(user, 'CART'), 'version': cart['version'] + 1,
                       'items': [line for line in cart['items'] if line['lineId'] not in ids]}),
                       'ConditionExpression': '#v=:v', 'ExpressionAttributeNames': {'#v': 'version'},
                       'ExpressionAttributeValues': app.values({':v': cart['version']})}}])
    try:
        app.ddb.transact_write_items(TransactItems=writes)
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'TransactionCanceledException':
            raise
        existing = read(user, sk)
        if existing and existing['payloadHash'] == fingerprint:
            enqueue_checkout(existing)
            return checkout_view(existing)
        raise Problem('VERSION_CONFLICT', 409) from exc
    enqueue_checkout(record)
    return checkout_view(record)


def process_checkout(message):
    record = read(message['userId'], 'CHECKOUT#' + message['checkoutId'])
    if not record:
        raise ValueError('Missing checkout')
    if record['status'] != 'PENDING':
        return
    status, reason, checks = 'CONFIRMED', '', []
    try:
        products, quantities, campaigns = validate_lines(record['lines'])
        if record.get('pricing') and price_checkout(record['lines'], products, record['pricing'], record['userId']) != record['pricing']:
            raise Problem('QUOTE_CHANGED', 409)
        for pid, qty in quantities.items():
            checks.append({'Update': {'TableName': app.products.name, 'Key': app.values({'productId': pid}),
                'UpdateExpression': 'SET stock=stock-:qty', 'ConditionExpression': 'stock>=:qty AND price=:price',
                'ExpressionAttributeValues': app.values({':qty': qty, ':price': products[pid]['price']})}})
        for cid, campaign in campaigns.items():
            checks.append({'ConditionCheck': {'TableName': app.campaigns.name, 'Key': app.values({'campaignId': cid}),
                'ConditionExpression': 'startTime=:start AND endTime=:end AND productIds=:ids AND maxQtyPerOrder=:qty',
                'ExpressionAttributeValues': app.values({':start': campaign['startTime'], ':end': campaign['endTime'],
                    ':ids': campaign['productIds'], ':qty': campaign['maxQtyPerOrder']})}})
        if record.get('voucher'):
            from vouchers import redemption, VoucherError
            try:checks.extend(redemption(record['voucher'],record['userId'],message['checkoutId'],int(record['subtotal']),app.values))
            except VoucherError as exc:raise Problem(str(exc),409)
    except Problem as exc:
        checks=[]
        status = 'OUT_OF_STOCK' if exc.code == 'SALE_SOLD_OUT' else 'FAILED'
        reason = exc.code
    updates = []
    for oid in record['orderIds']:
        updates.append({'Update': {'TableName': app.orders.name, 'Key': app.values({'orderId': oid}),
            'UpdateExpression': 'SET #s=:next, updatedAt=:at, failureReason=:reason',
            'ConditionExpression': '#s=:pending AND ownerId=:user', 'ExpressionAttributeNames': {'#s': 'status'},
            'ExpressionAttributeValues': app.values({':next': status, ':at': app.now(), ':reason': reason,
                                                   ':pending': 'PENDING', ':user': record['userId']})}})
    updates.append({'Update': {'TableName': table().name, 'Key': app.values(key(record['userId'], record['recordId'])),
        'UpdateExpression': 'SET #s=:next', 'ConditionExpression': '#s=:pending', 'ExpressionAttributeNames': {'#s': 'status'},
        'ExpressionAttributeValues': app.values({':next': status, ':pending': 'PENDING'})}})
    try:
        app.ddb.transact_write_items(TransactItems=checks + updates)
    except ClientError as exc:
        if exc.response['Error']['Code'] == 'TransactionCanceledException' and read(record['userId'], record['recordId'])['status'] != 'PENDING':
            return
        # Re-read stock/price/schedule on retry; never infer shortage from a conflict.
        raise


def route(event):
    try:
        if not os.environ.get('CUSTOMERS_TABLE'):
            raise Problem('CUSTOMER_NOT_CONFIGURED', 503)
        user, attributes = identity(event)
        method, path = event['requestContext']['http']['method'], event['rawPath']
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode()
        if len(raw) > 64000:
            raise Problem('REQUEST_TOO_LARGE', 413)
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise Problem('INVALID_REQUEST')
        if path == '/me/vouchers/quote' and method == 'POST':
            ids=payload.get('lineIds');cart=cart_record(user)
            if not isinstance(ids,list) or not ids or len(ids)>10 or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids):raise Problem('INVALID_SELECTION')
            lines=[line for line in cart['items'] if line['lineId'] in ids]
            if len(lines)!=len(ids):raise Problem('CART_CHANGED',409)
            validate_lines(lines)
            from vouchers import quote, VoucherError
            try:return app.response(200,quote(payload.get('code'),user,sum(int(l['unitPrice'])*l['quantity'] for l in lines)))
            except VoucherError as exc:raise Problem(str(exc),409)
        if path == '/me/profile':
            if method == 'PUT':
                save_profile(user, payload)
            if method in ('PUT', 'GET'):
                return app.response(200, profile(user, attributes))
        if path == '/me/cart':
            if method == 'PUT':
                save_cart(user, payload)
            if method in ('PUT', 'GET'):
                return app.response(200, cart_view(user))
        if path == '/me/checkouts' and method == 'POST':
            result = create_checkout(user, payload, {k.lower(): v for k, v in event.get('headers', {}).items()})
            return app.response(202 if result['status'] == 'PENDING' else 200, result)
        if path == '/me/checkout-quote':
            if method == 'GET':
                return app.response(200, checkout_options())
            if method == 'POST':
                return app.response(200, checkout_quote(user, payload))
        if path.startswith('/me/checkouts/') and method == 'GET':
            record = read(user, 'CHECKOUT#' + path.split('/')[-1])
            if not record:
                raise Problem('CHECKOUT_NOT_FOUND', 404)
            enqueue_checkout(record)
            return app.response(200, checkout_view(record))
        if path == '/me/orders' and method == 'GET':
            return app.response(200, order_list(user, event.get('queryStringParameters') or {}))
        if path.startswith('/me/orders/') and method == 'GET':
            return app.response(200, order_view(owned_order(user, path.split('/')[-1])))
        raise Problem('NOT_FOUND', 404)
    except Problem as exc:
        return app.error(exc.status, exc.code)
