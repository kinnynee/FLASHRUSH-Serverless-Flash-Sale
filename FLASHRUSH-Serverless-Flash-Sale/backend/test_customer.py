import importlib
import json
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import boto3
from moto import mock_aws


@mock_aws
class CustomerTests(unittest.TestCase):
    def setUp(self):
        os.environ.update(AWS_DEFAULT_REGION='us-east-1', PRODUCTS_TABLE='products', ORDERS_TABLE='orders',
                          CAMPAIGNS_TABLE='campaigns', CUSTOMERS_TABLE='customers', CUSTOMER_CLIENT_ID='client',
                          CUSTOMER_ISSUER='https://issuer.test')
        db = boto3.resource('dynamodb')
        for name, pk in [('products', 'productId'), ('orders', 'orderId'), ('campaigns', 'campaignId')]:
            db.create_table(TableName=name, BillingMode='PAY_PER_REQUEST', KeySchema=[{'AttributeName': pk, 'KeyType': 'HASH'}],
                            AttributeDefinitions=[{'AttributeName': pk, 'AttributeType': 'S'}])
        db.create_table(TableName='customers', BillingMode='PAY_PER_REQUEST',
            KeySchema=[{'AttributeName': 'userId', 'KeyType': 'HASH'}, {'AttributeName': 'recordId', 'KeyType': 'RANGE'}],
            AttributeDefinitions=[{'AttributeName': k, 'AttributeType': 'S'} for k in ('userId', 'recordId')])
        os.environ['QUEUE_URL'] = boto3.client('sqs').create_queue(QueueName='orders')['QueueUrl']
        import app
        import customer
        self.app = importlib.reload(app)
        self.customer = importlib.reload(customer)
        self.start = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        self.end = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        for pid in ('one', 'two'):
            self.app.products.put_item(Item={'productId': pid, 'name': pid, 'description': 'Test', 'category': 'Test',
                'stock': 3, 'initialStock': 3, 'price': 100, 'originalPrice': 150, 'images': ['/test.jpg'],
                'colors': ['Black', 'White'], 'isFlashSale': True, 'saleStartsAt': self.start, 'saleEndsAt': self.end})
        self.app.campaigns.put_item(Item={'campaignId': 'sale', 'name': 'Sale', 'startTime': self.start,
            'endTime': self.end, 'productIds': ['one', 'two'], 'maxQtyPerOrder': 3})
        self.address = {'id': 'home', 'name': 'Customer', 'phone': '0900000000', 'street': '1 Test', 'ward': 'Ward', 'city': 'City'}
        self.customer.save_profile('alice', {'name': 'Alice', 'phone': '', 'avatar': '', 'addresses': [self.address], 'defaultAddressId': 'home', 'version': 0})

    def request(self, method, path, body=None, user='alice', claims=None, headers=None):
        jwt = {'sub': user, 'iss': os.environ['CUSTOMER_ISSUER'], 'client_id': 'client', 'token_use': 'access'} if claims is None else claims
        event = {'rawPath': path, 'requestContext': {'http': {'method': method}, 'authorizer': {'jwt': {'claims': jwt}}},
                 'headers': {'Authorization': 'Bearer access', **(headers or {})}, 'body': json.dumps(body or {})}
        attrs = {'UserAttributes': [{'Name': 'sub', 'Value': user}, {'Name': 'email_verified', 'Value': 'true'}, {'Name': 'email', 'Value': user+'@example.test'}]}
        with patch('customer.boto3.client') as factory:
            factory.return_value.get_user.return_value = attrs
            result = self.app.api(event, None)
        return result['statusCode'], json.loads(result['body'])

    def prepare(self, user='alice', quantity=1):
        if user != 'alice':
            self.customer.save_profile(user, {'name': user, 'phone': '', 'avatar': '', 'addresses': [self.address], 'defaultAddressId': 'home', 'version': 0})
        self.customer.save_cart(user, {'version': 0, 'items': [{'productId': pid, 'quantity': quantity, 'color': '', 'unitPrice': 100} for pid in ('one', 'two')]})
        cart = self.customer.cart_record(user)
        return {'version': 1, 'lineIds': [i['lineId'] for i in cart['items']], 'addressId': 'home'}

    def checkout(self, body, user='alice', token=None):
        token = token or str(uuid.uuid4())
        code, result = self.request('POST', '/me/checkouts', body, user, headers={'Idempotency-Key': token})
        return code, result, token

    def process(self, checkout, user='alice'):
        self.app.process({'schemaVersion': '2.0', 'userId': user, 'checkoutId': checkout['checkoutId']})

    def test_auth_requires_gateway_access_claims_and_matching_cognito_identity(self):
        for claims in ({}, {'sub': 'alice', 'iss': 'wrong', 'client_id': 'client', 'token_use': 'access'},
                       {'sub': 'alice', 'iss': os.environ['CUSTOMER_ISSUER'], 'client_id': 'client', 'token_use': 'id'},
                       {'sub': 'mallory', 'iss': os.environ['CUSTOMER_ISSUER'], 'client_id': 'client', 'token_use': 'access'}):
            self.assertEqual(self.request('GET', '/me/profile', claims=claims)[0], 401)

    def test_cart_and_profile_are_private_and_versions_prevent_lost_updates(self):
        self.prepare()
        self.assertEqual(len(self.request('GET', '/me/cart')[1]['items']), 2)
        self.assertEqual(self.request('GET', '/me/cart', user='bob')[1]['items'], [])
        self.assertEqual(self.request('PUT', '/me/cart', {'version': 0, 'items': []})[0], 409)
        self.assertEqual(self.request('PUT', '/me/cart', {'version': 1, 'items': [], 'userId': 'bob'})[0], 400)
        self.assertEqual(self.app.products.get_item(Key={'productId': 'one'})['Item']['stock'], 3)

    def test_batch_checkout_snapshots_address_price_and_is_atomic_idempotent(self):
        body = self.prepare()
        code, result, token = self.checkout(body)
        self.assertEqual(code, 202)
        self.assertEqual(len(result['orders']), 2)
        self.assertEqual(self.customer.cart_record('alice')['items'], [])
        self.assertEqual(self.checkout(body, token=token)[1]['checkoutId'], result['checkoutId'])
        self.process(result)
        self.process(result)
        for pid in ('one', 'two'):
            self.assertEqual(self.app.products.get_item(Key={'productId': pid})['Item']['stock'], 2)
        for order in result['orders']:
            self.assertEqual(self.app.read_order(order['orderId'])['status'], 'CONFIRMED')
            self.assertEqual(self.request('GET', '/me/orders/'+order['orderId'], user='bob')[0], 404)
            self.assertEqual(self.request('GET', '/orders/'+order['orderId'], headers={'X-Order-Token': token})[0], 404)
        self.assertEqual(self.request('GET', '/me/checkouts/'+result['checkoutId'], user='bob')[0], 404)

    def test_stock_competition_never_partially_fulfills_group_or_goes_negative(self):
        _, alice, _ = self.checkout(self.prepare(quantity=2))
        _, bob, _ = self.checkout(self.prepare('bob', quantity=2), user='bob')
        self.process(alice)
        self.process(bob, 'bob')
        for pid in ('one', 'two'):
            self.assertEqual(self.app.products.get_item(Key={'productId': pid})['Item']['stock'], 1)
        for order in bob['orders']:
            self.assertEqual(self.app.read_order(order['orderId'])['status'], 'OUT_OF_STOCK')

    def test_price_change_after_acceptance_fails_entire_group_without_decrement(self):
        _, result, _ = self.checkout(self.prepare())
        self.app.products.update_item(Key={'productId': 'two'}, UpdateExpression='SET price=:v', ExpressionAttributeValues={':v': 200})
        self.process(result)
        self.assertEqual(self.app.read_order(result['orders'][0]['orderId'])['failureReason'], 'PRICE_CHANGED')
        for pid in ('one', 'two'):
            self.assertEqual(self.app.products.get_item(Key={'productId': pid})['Item']['stock'], 3)

    def test_expired_sale_at_worker_rejects_group(self):
        _, result, _ = self.checkout(self.prepare())
        self.app.campaigns.update_item(Key={'campaignId': 'sale'}, UpdateExpression='SET endTime=:v', ExpressionAttributeValues={':v': self.start})
        self.process(result)
        self.assertEqual(self.app.read_order(result['orders'][0]['orderId'])['failureReason'], 'SALE_ENDED')
        self.assertEqual(self.app.products.get_item(Key={'productId': 'one'})['Item']['stock'], 3)

    def test_same_key_different_payload_conflicts(self):
        body = self.prepare()
        _, _, token = self.checkout(body)
        self.assertEqual(self.checkout({**body, 'lineIds': body['lineIds'][:1]}, token=token)[0], 409)

    def test_snapshot_change_rejected_before_acceptance(self):
        body = self.prepare()
        self.app.products.update_item(Key={'productId': 'one'}, UpdateExpression='SET price=:v', ExpressionAttributeValues={':v': 999})
        self.assertEqual(self.checkout(body)[1]['error']['code'], 'PRICE_CHANGED')
        self.assertEqual(self.app.orders.scan()['Count'], 0)

    def test_variant_quantities_aggregate_for_campaign_limit(self):
        self.customer.save_cart('alice', {'version': 0, 'items': [{'productId': 'one', 'quantity': 2, 'color': color, 'unitPrice': 100} for color in ('Black', 'White')]})
        cart = self.customer.cart_record('alice')
        self.app.products.update_item(Key={'productId': 'one'}, UpdateExpression='SET stock=:v', ExpressionAttributeValues={':v': 10})
        code, result, _ = self.checkout({'version': 1, 'lineIds': [l['lineId'] for l in cart['items']], 'addressId': 'home'})
        self.assertEqual(code, 409)
        self.assertEqual(result['error']['code'], 'CAMPAIGN_QUANTITY_LIMIT')

    def test_queue_timeout_replays_same_group_and_decrements_once(self):
        body = self.prepare(); token = str(uuid.uuid4())
        with patch.object(self.app.sqs, 'send_message', side_effect=TimeoutError):
            self.assertEqual(self.checkout(body, token=token)[0], 503)
        checkout_id = self.app.digest('alice:' + token)[:32]
        self.customer.table().update_item(Key=self.customer.key('alice', 'CHECKOUT#'+checkout_id), UpdateExpression='SET leaseUntil=:v', ExpressionAttributeValues={':v': 0})
        _, result, _ = self.checkout(body, token=token)
        self.assertEqual(self.app.orders.scan()['Count'], 2)
        self.process(result)
        self.assertEqual(self.app.products.get_item(Key={'productId': 'one'})['Item']['stock'], 2)

    def test_legacy_worker_cannot_process_customer_child(self):
        _, result, _ = self.checkout(self.prepare())
        with self.assertRaises(ValueError):
            self.app.process({'schemaVersion': '1.0', **{k: result['orders'][0][k] for k in ('orderId', 'productId', 'quantity')}})

    def test_invalid_defaults_and_cart_values_fail_closed(self):
        self.assertEqual(self.request('PUT', '/me/profile', {'name': 'Alice', 'phone': '', 'avatar': '', 'addresses': [], 'defaultAddressId': 'unknown', 'version': 1})[0], 400)
        for qty in (True, 0, -1, 101, '1'):
            self.assertEqual(self.request('PUT', '/me/cart', {'version': 0, 'items': [{'productId': 'one', 'quantity': qty, 'color': '', 'unitPrice': 100}]})[0], 400)

    def priced_selection(self, prices):
        os.environ['BUSINESS_TABLE'] = 'business'
        business_table = boto3.resource('dynamodb').create_table(TableName='business', BillingMode='PAY_PER_REQUEST',
            KeySchema=[{'AttributeName':'id','KeyType':'HASH'}], AttributeDefinitions=[{'AttributeName':'id','AttributeType':'S'}])
        business_table.put_item(Item={'id':'voucher#FLASH37','kind':'voucher','code':'FLASH37','type':'percent',
            'value':37,'minSpend':3600000,'maxDiscount':0,'usageLimit':10,'usedCount':0,'version':1,
            'enabled':True,'startsAt':self.start,'endsAt':self.end})
        for pid, price in zip(('one', 'two'), prices):
            self.app.products.update_item(Key={'productId': pid}, UpdateExpression='SET price=:p', ExpressionAttributeValues={':p': price})
        self.customer.save_cart('alice', {'version': 0, 'items': [
            {'productId': pid, 'quantity': 1, 'color': '', 'unitPrice': price}
            for pid, price in zip(('one', 'two'), prices)]})
        return {'version': 1, 'lineIds': [line['lineId'] for line in self.customer.cart_record('alice')['items']], 'voucherCode': 'FLASH37'}

    def test_quote_uses_owned_selection_and_does_not_reserve_stock(self):
        body = self.priced_selection([1800000, 1800000])
        code, quote = self.request('POST', '/me/checkout-quote', body)
        self.assertEqual(code, 200)
        self.assertEqual((quote['subtotal'], quote['discount'], quote['total']), (3600000, 1332000, 2268000))
        self.assertEqual(self.app.orders.scan()['Count'], 0)
        self.assertEqual(self.app.products.get_item(Key={'productId': 'one'})['Item']['stock'], 3)
        self.assertEqual(self.request('POST', '/me/checkout-quote', body, user='bob')[0], 409)
        self.assertEqual(self.request('POST', '/me/checkout-quote', {**body, 'lineIds': body['lineIds'][:1]})[1]['error']['code'], 'VOUCHER_MIN_SPEND')

    def test_voucher_below_threshold_and_untrusted_payload_rejected(self):
        body = self.priced_selection([1800000, 1799999])
        self.assertEqual(self.request('POST', '/me/checkout-quote', body)[1]['error']['code'], 'VOUCHER_MIN_SPEND')
        for extra in ({'discount': 9999}, {'userId': 'bob'}, {'voucherCode': 'FREE'}, {'paymentMethod': 'PAID'}, {'shippingMethod': 'EXPRESS'}):
            self.assertGreaterEqual(self.request('POST', '/me/checkout-quote', {**body, 'voucherCode': '', **extra})[0], 400)
        code, quote = self.request('POST', '/me/checkout-quote', {**body, 'voucherCode': ''})
        self.assertEqual(code, 200)
        self.assertEqual(quote['total'], 3599999)

    def test_discount_rounding_allocation_replay_and_revenue(self):
        body = self.priced_selection([1800001, 1800002])
        quote = self.request('POST', '/me/checkout-quote', body)[1]
        self.assertEqual(quote['discount'], 1332001)
        checkout_body = {**body, 'addressId': 'home', 'expectedTotal': quote['total']}
        code, result, token = self.checkout(checkout_body)
        self.assertEqual(code, 202)
        self.assertEqual(sum(o['item']['discountAmount'] for o in result['orders']), quote['discount'])
        self.assertEqual(sum(o['item']['totalAmount'] for o in result['orders']), quote['total'])
        self.process(result); self.process(result)
        self.assertEqual(self.app.admin_overview_payload()['totalRevenue'], quote['total'])
        self.assertEqual(self.checkout(checkout_body, token=token)[1]['pricing'], quote)
        self.assertEqual(self.checkout({**checkout_body, 'voucherCode': ''}, token=token)[0], 409)

    def test_checkout_revalidates_quote_and_rejects_forged_total(self):
        body = self.priced_selection([1800000, 1800000])
        self.assertEqual(self.checkout({**body, 'addressId': 'home'})[1]['error']['code'], 'QUOTE_REQUIRED')
        self.assertEqual(self.checkout({**body, 'addressId': 'home', 'expectedTotal': 1})[1]['error']['code'], 'QUOTE_CHANGED')
        self.app.products.update_item(Key={'productId': 'one'}, UpdateExpression='SET price=:p', ExpressionAttributeValues={':p': 1700000})
        self.assertEqual(self.checkout({**body, 'addressId': 'home', 'expectedTotal': 2268000})[1]['error']['code'], 'PRICE_CHANGED')
        self.assertEqual(self.app.orders.scan()['Count'], 0)
        self.assertEqual(len(self.customer.cart_record('alice')['items']), 2)

    def test_worker_rejects_changed_discount_snapshot_without_stock_change(self):
        body = self.priced_selection([1800000, 1800000])
        _, result, _ = self.checkout({**body, 'addressId': 'home', 'expectedTotal': 2268000})
        self.customer.table().update_item(Key=self.customer.key('alice', 'CHECKOUT#'+result['checkoutId']),
            UpdateExpression='SET pricing.discount=:d', ExpressionAttributeValues={':d': 1})
        self.process(result)
        self.assertEqual(self.app.read_order(result['orders'][0]['orderId'])['failureReason'], 'QUOTE_CHANGED')
        self.assertEqual(self.app.products.get_item(Key={'productId': 'one'})['Item']['stock'], 3)


if __name__ == '__main__':
    unittest.main()
