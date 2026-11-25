import importlib
import json
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock
from unittest.mock import patch

import boto3
from botocore.exceptions import ClientError
from moto import mock_aws


DYNAMODB_LOCAL = 'http://127.0.0.1:8250'
USE_DYNAMODB_LOCAL = os.environ.get('F10_DYNAMODB_LOCAL') == '1'


@mock_aws(config={'core': {'passthrough': {'urls': [r'http://127\.0\.0\.1:8250/.*']}}})
class BackendTests(unittest.TestCase):
    def setUp(self):
        os.environ.update(AWS_DEFAULT_REGION='us-east-1', PRODUCTS_TABLE='products', ORDERS_TABLE='orders',
                          CAMPAIGNS_TABLE='campaigns')
        options = {'region_name': 'us-east-1'}
        suffix = ''
        if USE_DYNAMODB_LOCAL:
            options.update(endpoint_url=DYNAMODB_LOCAL, aws_access_key_id='local', aws_secret_access_key='local')
            suffix = '-' + uuid.uuid4().hex
        db = boto3.resource('dynamodb', **options)
        for variable, key in [('PRODUCTS_TABLE', 'productId'), ('ORDERS_TABLE', 'orderId'), ('CAMPAIGNS_TABLE', 'campaignId')]:
            os.environ[variable] += suffix
            table = db.create_table(TableName=os.environ[variable], KeySchema=[{'AttributeName': key, 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': key, 'AttributeType': 'S'}], BillingMode='PAY_PER_REQUEST')
            if USE_DYNAMODB_LOCAL:
                self.addCleanup(table.delete)
        sqs = boto3.client('sqs', region_name='us-east-1')
        os.environ['QUEUE_URL'] = sqs.create_queue(QueueName='orders')['QueueUrl']
        import app
        self.app = importlib.reload(app)
        if USE_DYNAMODB_LOCAL:
            self.app.products = db.Table(os.environ['PRODUCTS_TABLE'])
            self.app.orders = db.Table(os.environ['ORDERS_TABLE'])
            self.app.campaigns = db.Table(os.environ['CAMPAIGNS_TABLE'])
            self.app.ddb = boto3.client('dynamodb', **options)
        for pid, stock, price in [('sku', 10, 1200), ('sku-b', 20, 2200), ('sku-c', 5, 3200)]:
            self.app.products.put_item(Item={'productId': pid, 'stock': stock, 'price': price,
                'name': pid.upper(), 'images': ['/images/' + pid + '.jpg']})
        start = datetime.now(timezone.utc) - timedelta(hours=1)
        end = datetime.now(timezone.utc) + timedelta(hours=1)
        self.app.campaigns.put_item(Item={'campaignId': 'active', 'name': 'Active Sale',
            'startTime': start.isoformat(), 'endTime': end.isoformat(), 'status': 'ACTIVE',
            'productIds': ['sku', 'sku-b', 'sku-c'], 'maxQtyPerOrder': 1})

    def post(self, key=None, payload=None):
        key = key or str(uuid.uuid4())
        result = self.app.api({'requestContext': {'http': {'method': 'POST'}}, 'rawPath': '/orders',
            'headers': {'Idempotency-Key': key},
            'body': json.dumps({'productId': 'sku', 'quantity': 1} if payload is None else payload)}, None)
        return key, result, json.loads(result['body'])

    def request(self, method, path, payload=None):
        result = self.app.api({'requestContext': {'http': {'method': method}}, 'rawPath': path,
            'headers': {}, 'body': json.dumps(payload) if payload is not None else None}, None)
        return result, json.loads(result['body'])

    def drain(self):
        while True:
            messages = self.app.sqs.receive_message(QueueUrl=os.environ['QUEUE_URL'], MaxNumberOfMessages=10).get('Messages', [])
            if not messages:
                return
            for msg in messages:
                self.app.process(json.loads(msg['Body']))
                self.app.sqs.delete_message(QueueUrl=os.environ['QUEUE_URL'], ReceiptHandle=msg['ReceiptHandle'])

    def test_100_orders_and_duplicate_worker(self):
        for _ in range(100):
            self.assertEqual(self.post()[1]['statusCode'], 202)
        self.drain()
        items = self.app.orders.scan()['Items']
        self.assertEqual(sum(i['status'] == 'CONFIRMED' for i in items), 10)
        self.assertEqual(sum(i['status'] == 'OUT_OF_STOCK' for i in items), 90)
        item = next(i for i in items if i['status'] == 'CONFIRMED')
        self.app.process({'schemaVersion': '1.0', 'orderId': item['orderId'], 'productId': item['productId'],
                          'quantity': int(item['quantity'])})
        self.assertEqual(self.app.products.get_item(Key={'productId': 'sku'})['Item']['stock'], 0)

    def test_replay_conflict_and_token(self):
        key, _, item = self.post()
        self.assertEqual(self.post(key)[2]['orderId'], item['orderId'])
        self.assertEqual(self.post(key, {'productId': 'other', 'quantity': 1})[1]['statusCode'], 409)
        event = {'requestContext': {'http': {'method': 'GET'}}, 'rawPath': '/orders/'+item['orderId']}
        self.assertEqual(self.app.api(event, None)['statusCode'], 404)
        event['headers'] = {'X-Order-Token': key}
        self.assertEqual(self.app.api(event, None)['statusCode'], 200)

    def test_enqueue_uncertain_recovers_same_order(self):
        key = str(uuid.uuid4())
        with patch.object(self.app.sqs, 'send_message', side_effect=TimeoutError):
            _, result, _ = self.post(key)
        self.assertEqual(result['statusCode'], 503)
        item = self.app.orders.scan()['Items'][0]
        self.assertEqual(item['enqueueState'], 'UNKNOWN')
        self.app.orders.update_item(Key={'orderId': item['orderId']}, UpdateExpression='SET enqueueLeaseUntil=:t', ExpressionAttributeValues={':t': 0})
        self.assertEqual(self.post(key)[1]['statusCode'], 202)
        self.assertEqual(self.app.orders.scan()['Count'], 1)

    def test_validation_and_poison_message(self):
        for quantity in [0, -1, True, '1']:
            self.assertEqual(self.post(payload={'productId': 'sku', 'quantity': quantity})[1]['statusCode'], 400)
        result = self.app.worker({'Records': [{'messageId': 'bad', 'body': '{}'}]}, None)
        self.assertEqual(result, {'batchItemFailures': [{'itemIdentifier': 'bad'}]})

    def test_ack_timeout_then_recovery_decrements_once_with_stock_remaining(self):
        original = self.app.sqs.send_message
        def accepted_then_timeout(**kwargs):
            original(**kwargs)
            raise TimeoutError('ACK lost')
        key = str(uuid.uuid4())
        with patch.object(self.app.sqs, 'send_message', side_effect=accepted_then_timeout):
            self.assertEqual(self.post(key)[1]['statusCode'], 503)
        item = self.app.orders.scan()['Items'][0]
        self.app.orders.update_item(Key={'orderId': item['orderId']}, UpdateExpression='SET enqueueLeaseUntil=:t', ExpressionAttributeValues={':t': 0})
        self.assertEqual(self.post(key)[1]['statusCode'], 202)
        self.drain()
        self.assertEqual(self.app.products.get_item(Key={'productId': 'sku'})['Item']['stock'], 9)

    def test_orders_rejected_outside_campaign_window(self):
        start = datetime.now(timezone.utc) - timedelta(hours=2)
        end = datetime.now(timezone.utc) - timedelta(hours=1)
        self.app.campaigns.update_item(Key={'campaignId': 'active'},
            UpdateExpression='SET startTime=:start, endTime=:end',
            ExpressionAttributeValues={':start': start.isoformat(), ':end': end.isoformat()})
        _, result, body = self.post()
        self.assertEqual(result['statusCode'], 409)
        self.assertEqual(body['error']['code'], 'CAMPAIGN_NOT_ACTIVE')
        self.assertEqual(self.app.orders.scan()['Count'], 0)
        self.assertEqual(self.app.sqs.receive_message(QueueUrl=os.environ['QUEUE_URL']).get('Messages', []), [])

    def test_orders_rejected_above_campaign_quantity_limit(self):
        _, result, body = self.post(payload={'productId': 'sku', 'quantity': 2})
        self.assertEqual(result['statusCode'], 409)
        self.assertEqual(body['error']['code'], 'CAMPAIGN_QUANTITY_LIMIT')
        self.assertEqual(self.app.orders.scan()['Count'], 0)

    def test_allowed_multi_quantity_order_decrements_stock_atomically(self):
        self.app.campaigns.update_item(Key={'campaignId': 'active'},
            UpdateExpression='SET maxQtyPerOrder=:limit',
            ExpressionAttributeValues={':limit': 3})
        _, result, order = self.post(payload={'productId': 'sku', 'quantity': 2})
        self.assertEqual(result['statusCode'], 202)
        self.drain()
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'CONFIRMED')
        self.assertEqual(self.app.products.get_item(Key={'productId': 'sku'})['Item']['stock'], 8)

    def test_campaign_api_create_patch_and_read(self):
        start = datetime.now(timezone.utc) + timedelta(days=1)
        payload = {'name': 'Tomorrow', 'startTime': start.isoformat(),
            'endTime': (start + timedelta(hours=2)).isoformat(), 'productIds': ['sku'], 'maxQtyPerOrder': 3}
        result, created = self.request('POST', '/admin/campaigns', payload)
        self.assertEqual(result['statusCode'], 201)
        campaign_id = created['campaignId']
        self.assertEqual(created['status'], 'UPCOMING')
        result, updated = self.request('PATCH', '/admin/campaigns/' + campaign_id, {'maxQtyPerOrder': 4})
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(updated['maxQtyPerOrder'], 4)
        result, listed = self.request('GET', '/campaigns')
        self.assertEqual(result['statusCode'], 200)
        self.assertIn(campaign_id, [item['campaignId'] for item in listed['items']])
        self.assertEqual(self.request('GET', '/campaigns/' + campaign_id)[0]['statusCode'], 200)

    def test_active_lease_and_attempt_limit_prevent_resend(self):
        with patch.object(self.app.sqs, 'send_message', side_effect=TimeoutError):
            key, _, _ = self.post()
        with patch.object(self.app.sqs, 'send_message') as send:
            self.assertEqual(self.post(key)[1]['statusCode'], 503)
            send.assert_not_called()
        item = self.app.orders.scan()['Items'][0]
        self.app.orders.update_item(Key={'orderId': item['orderId']}, UpdateExpression='SET enqueueLeaseUntil=:t, enqueueAttemptCount=:n', ExpressionAttributeValues={':t': 0, ':n': 3})
        with patch.object(self.app.sqs, 'send_message') as send:
            self.assertEqual(self.post(key)[1]['statusCode'], 503)
            send.assert_not_called()

    def test_transaction_conflict_retries_without_false_out_of_stock(self):
        from botocore.exceptions import ClientError
        _, _, order = self.post()
        message = {'schemaVersion': '1.0', 'orderId': order['orderId'], 'productId': 'sku', 'quantity': 1}
        conflict = ClientError({'Error': {'Code': 'TransactionCanceledException'}, 'CancellationReasons': [{'Code': 'TransactionConflict'}]}, 'TransactWriteItems')
        event = {'Records': [{'messageId': 'retry', 'body': json.dumps(message)}]}
        with patch.object(self.app.ddb, 'transact_write_items', side_effect=conflict):
            self.assertEqual(self.app.worker(event, None)['batchItemFailures'], [{'itemIdentifier': 'retry'}])
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'PENDING')
        self.assertEqual(self.app.worker(event, None)['batchItemFailures'], [])
        self.assertEqual(self.app.products.get_item(Key={'productId': 'sku'})['Item']['stock'], 9)

    def test_concurrent_same_key_has_one_order(self):
        from concurrent.futures import ThreadPoolExecutor
        key = str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.post(key), range(8)))
        self.assertTrue(all(result[1]['statusCode'] in (202, 503) for result in results))
        self.assertEqual(self.app.orders.scan()['Count'], 1)
        self.drain()
        self.assertEqual(self.app.products.get_item(Key={'productId': 'sku'})['Item']['stock'], 9)

    def test_error_has_request_id(self):
        _, result, body = self.post(payload={'productId': 'sku', 'quantity': 2})
        self.assertEqual(result['headers']['X-Request-Id'], 'local')
        self.assertEqual(body['error']['requestId'], 'local')

    def checkout(self, *ids, key=None):
        return self.post(key, {'items': [{'productId': pid, 'quantity': 1} for pid in (ids or ('sku', 'sku-b'))]})

    def set_stock(self, pid, stock):
        self.app.products.update_item(Key={'productId': pid}, UpdateExpression='SET stock=:n',
                                      ExpressionAttributeValues={':n': stock})

    def stock(self, pid):
        return self.app.products.get_item(Key={'productId': pid}, ConsistentRead=True)['Item']['stock']

    def message(self, order, message_id=None):
        record = self.app.read_order(order['orderId'])
        body = {'schemaVersion': '2.0', 'orderId': order['orderId'], 'correlationId': record['correlationId']}
        return {'messageId': message_id or order['orderId'], 'body': json.dumps(body)}

    def process_in_parallel(self, messages):
        def process(record):
            return self.app.worker({'Records': [record]}, None)['batchItemFailures']
        if USE_DYNAMODB_LOCAL:
            return self.run_workers(messages, process)
        # Moto restores whole-table copies on cancellation, which can overwrite
        # another thread's commit. Run real worker threads but serialize emulator I/O.
        io_lock = Lock()
        def serialized(operation):
            def call(*args, **kwargs):
                with io_lock:
                    return operation(*args, **kwargs)
            return call
        with (patch.object(self.app.ddb, 'transact_write_items', serialized(self.app.ddb.transact_write_items)),
              patch.object(self.app, 'read_order', serialized(self.app.read_order)),
              patch.object(self.app.products, 'get_item', serialized(self.app.products.get_item))):
            self.run_workers(messages, process)

    def run_workers(self, messages, process):
        with ThreadPoolExecutor(max_workers=10) as pool:
            pending = messages
            for _ in range(5):
                failures = {item['itemIdentifier'] for result in pool.map(process, pending) for item in result}
                if not failures:
                    return
                pending = [record for record in pending if record['messageId'] in failures]
        self.fail(f'Unresolved worker messages: {len(pending)}')

    def assert_stock_matches_confirmed(self, initial):
        records = self.app.orders.scan()['Items']
        for pid, stock in initial.items():
            sold = sum(line['quantity'] for order in records if order['status'] == 'CONFIRMED'
                       for line in order['items'] if line['productId'] == pid)
            self.assertGreaterEqual(self.stock(pid), 0)
            self.assertEqual(self.stock(pid), stock - sold)
        return records

    def test_cart_snapshot_and_versioned_message(self):
        payload = {'totalAmount': 1, 'status': 'CONFIRMED', 'items': [
            {'productId': 'sku-b', 'quantity': 1, 'unitPrice': 1},
            {'productId': 'sku', 'quantity': 1, 'name': 'fake', 'subtotal': 1},
        ]}
        key, result, order = self.post(payload=payload)
        self.assertEqual(result['statusCode'], 202)
        self.assertEqual(order['status'], 'PENDING')
        self.assertEqual(order['totalQuantity'], 2)
        self.assertEqual((order['subtotal'], order['discountAmount'], order['totalAmount']), (3400, 0, 3400))
        self.assertEqual(order['items'][0], dict(productId='sku', quantity=1, name='SKU',
                         image='/images/sku.jpg', unitPrice=1200, subtotal=1200))
        self.assertNotIn('payloadHash', order)
        msg = self.app.sqs.receive_message(QueueUrl=os.environ['QUEUE_URL'])['Messages'][0]
        body = json.loads(msg['Body'])
        self.assertEqual(body, json.loads(self.message(order)['body']))
        invalid = dict(body, correlationId='wrong')
        self.assertEqual(self.app.worker({'Records': [{'messageId': 'bad', 'body': json.dumps(invalid)}]}, None)
                         ['batchItemFailures'], [{'itemIdentifier': 'bad'}])
        self.app.products.update_item(Key={'productId': 'sku'}, UpdateExpression='SET price=:p',
                                      ExpressionAttributeValues={':p': 9999})
        self.app.process(body)
        _, replay_status, replay = self.checkout('sku-b', 'sku', key=key)
        self.assertEqual(replay_status['statusCode'], 200)
        self.assertEqual(replay['orderId'], order['orderId'])
        self.assertEqual(replay['items'], order['items'])
        self.assertTrue(replay['confirmedAt'])
        event = {'requestContext': {'http': {'method': 'GET'}}, 'rawPath': '/orders/' + order['orderId']}
        self.assertEqual(self.app.api(event, None)['statusCode'], 404)
        event['headers'] = {'X-Order-Token': key}
        status = self.app.api(event, None)
        self.assertEqual(status['statusCode'], 200)
        self.assertEqual(json.loads(status['body']), replay)
        self.assertEqual(self.app.orders.scan()['Count'], 1)
        self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 20})

    def test_cart_rejects_invalid_requests_and_aggregates_duplicates(self):
        invalid = [[], 'bad', [None], [{}], [{'productId': '', 'quantity': 1}],
                   [{'productId': 'sku', 'quantity': 1.5}], [{'productId': 'sku', 'quantity': True}],
                   [{'productId': 'sku', 'quantity': '1'}],
                   [{'productId': str(i), 'quantity': 1} for i in range(self.app.MAX_CART_ITEMS + 1)]]
        for items in invalid:
            with self.subTest(items=items):
                self.assertEqual(self.post(payload={'items': items})[1]['statusCode'], 400)
        self.assertEqual(self.post(payload={'items': [], 'productId': 'sku', 'quantity': 1})[1]['statusCode'], 400)
        self.assertEqual(self.post(payload={'productId': 'sku', 'quantity': 1,
                         'padding': 'x' * self.app.MAX_REQUEST_BYTES})[1]['statusCode'], 400)
        self.assertEqual(self.checkout('sku', 'missing')[1]['statusCode'], 404)
        self.assertEqual(self.checkout('sku', 'sku')[2]['error']['code'], 'CAMPAIGN_QUANTITY_LIMIT')
        self.assertEqual(self.app.orders.scan()['Count'], 0)
        self.app.campaigns.update_item(Key={'campaignId': 'active'}, UpdateExpression='SET maxQtyPerOrder=:max',
                                       ExpressionAttributeValues={':max': 2})
        key, accepted, record = self.checkout('sku', 'sku', 'sku-b')
        self.assertEqual(accepted['statusCode'], 202)
        self.assertEqual(record['items'][0]['quantity'], 2)
        self.assertEqual(self.checkout('sku', 'sku-b', key=key)[1]['statusCode'], 409)
        self.assertEqual(self.checkout('sku', 'sku-c', key=key)[1]['statusCode'], 409)
        self.assertEqual(self.checkout('sku-b', 'sku', 'sku', key=key)[2]['orderId'], record['orderId'])

    def test_single_legacy_pending_hash_and_no_invented_history_price(self):
        key, _, order = self.post()
        self.app.orders.update_item(Key={'orderId': order['orderId']},
                                    UpdateExpression='REMOVE #lines, totalQuantity, subtotal, discountAmount, totalAmount',
                                    ExpressionAttributeNames={'#lines': 'items'})
        with patch.object(self.app.products, 'get_item', side_effect=AssertionError('Replay must skip the catalog')):
            _, response, replay = self.checkout('sku', key=key)
        self.assertEqual(response['statusCode'], 202)
        self.assertEqual(replay['items'], [{'productId': 'sku', 'quantity': 1}])
        self.assertNotIn('totalAmount', replay)
        self.drain()
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'CONFIRMED')

    def test_pricing_snapshot_order_size_is_bounded_before_persisting(self):
        self.app.products.update_item(Key={'productId': 'sku-b'}, UpdateExpression='SET images=:img',
                                      ExpressionAttributeValues={':img': ['a' * self.app.MAX_ORDER_BYTES]})
        _, response, body = self.checkout()
        self.assertEqual(response['statusCode'], 400)
        self.assertEqual(body['error']['code'], 'ORDER_TOO_LARGE')
        self.assertEqual(self.app.orders.scan()['Count'], 0)

    def test_multi_product_reconcile_after_lost_ack(self):
        original = self.app.sqs.send_message
        def accepted_then_timeout(**kwargs):
            original(**kwargs)
            raise TimeoutError('ACK lost')
        with patch.object(self.app.sqs, 'send_message', side_effect=accepted_then_timeout):
            key, response, _ = self.checkout()
        self.assertEqual(response['statusCode'], 503)
        record = self.app.orders.scan()['Items'][0]
        self.assertEqual(record['enqueueState'], 'UNKNOWN')
        self.app.orders.update_item(Key={'orderId': record['orderId']}, UpdateExpression='SET enqueueLeaseUntil=:t',
                                    ExpressionAttributeValues={':t': 0})
        self.assertTrue(self.app.enqueue(self.app.read_order(record['orderId'])))
        self.drain()
        self.assertEqual(self.checkout(key=key)[1]['statusCode'], 200)
        self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 20})

    def test_one_or_both_sold_out_leave_every_stock_unchanged(self):
        for stock_a in (100, 0):
            with self.subTest(stock_a=stock_a):
                self.set_stock('sku', stock_a)
                self.set_stock('sku-b', 0)
                _, response, order = self.checkout()
                self.assertEqual(response['statusCode'], 202)
                self.drain()
                self.assertEqual(self.app.read_order(order['orderId'])['status'], 'OUT_OF_STOCK')
                self.assert_stock_matches_confirmed({'sku': stock_a, 'sku-b': 0})

    def test_restock_between_shortage_read_and_conditional_write(self):
        self.set_stock('sku-b', 0)
        _, _, order = self.checkout()
        event = {'Records': [self.message(order)]}
        transact = self.app.ddb.transact_write_items
        def restock_before_transition(**kwargs):
            if 'ConditionCheck' in kwargs['TransactItems'][0]:
                self.set_stock('sku-b', 3)
            return transact(**kwargs)
        with patch.object(self.app.ddb, 'transact_write_items', side_effect=restock_before_transition):
            self.assertEqual(len(self.app.worker(event, None)['batchItemFailures']), 1)
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'PENDING')
        self.assertEqual(self.app.worker(event, None)['batchItemFailures'], [])
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'CONFIRMED')
        self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 3})

    def test_invalid_or_missing_stock_is_not_reported_as_shortage(self):
        for remove in (False, True):
            with self.subTest(remove=remove):
                _, _, order = self.checkout()
                original = self.app.products.get_item(Key={'productId': 'sku-b'})['Item']
                if remove:
                    self.app.products.delete_item(Key={'productId': 'sku-b'})
                else:
                    self.set_stock('sku-b', 'invalid')
                self.drain()
                failed = self.app.read_order(order['orderId'])
                self.assertEqual(failed['status'], 'FAILED')
                self.assertEqual(failed['failureReason'], 'PRODUCT_REMOVED' if remove else 'INVALID_PRODUCT_STOCK')
                self.assertEqual(self.stock('sku'), 10)
                self.app.products.put_item(Item=original)

    def test_cart_conflict_does_not_terminalize_even_with_shortage(self):
        self.set_stock('sku-b', 0)
        _, _, order = self.checkout()
        reasons = [{'Code': 'TransactionConflict'}, {'Code': 'ConditionalCheckFailed'}, {'Code': 'None'}]
        conflict = ClientError({'Error': {'Code': 'TransactionCanceledException'}, 'CancellationReasons': reasons},
                               'TransactWriteItems')
        event = {'Records': [self.message(order)]}
        with patch.object(self.app.ddb, 'transact_write_items', side_effect=conflict) as write:
            self.assertEqual(len(self.app.worker(event, None)['batchItemFailures']), 1)
            write.assert_called_once()
        self.assertEqual(self.app.read_order(order['orderId'])['status'], 'PENDING')
        self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 0})

    def test_100_cart_workers_compete_for_the_same_stock(self):
        messages = []
        for _ in range(100):
            _, response, order = self.checkout()
            self.assertEqual(response['statusCode'], 202)
            messages.append(self.message(order))
        self.process_in_parallel(messages)
        records = self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 20})
        self.assertEqual(sum(order['status'] == 'CONFIRMED' for order in records), 10)
        self.assertEqual(sum(order['status'] == 'OUT_OF_STOCK' for order in records), 90)
        self.assertEqual((self.stock('sku'), self.stock('sku-b')), (0, 10))

    def test_overlapping_carts_compete_for_shared_product(self):
        for pid in ('sku', 'sku-b', 'sku-c'):
            self.set_stock(pid, 5)
        messages = []
        for _ in range(10):
            for pids in [('sku', 'sku-b'), ('sku-b', 'sku-c')]:
                _, response, order = self.checkout(*pids)
                self.assertEqual(response['statusCode'], 202)
                messages.append(self.message(order))
        self.process_in_parallel(messages)
        records = self.assert_stock_matches_confirmed({'sku': 5, 'sku-b': 5, 'sku-c': 5})
        self.assertEqual(sum(order['status'] == 'CONFIRMED' for order in records), 5)
        self.assertEqual(sum(order['status'] == 'OUT_OF_STOCK' for order in records), 15)

    def test_duplicate_cart_post_and_concurrent_deliveries_decrement_once(self):
        key, _, order = self.checkout()
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.checkout('sku-b', 'sku', key=key), range(8)))
        self.assertTrue(all(result[2]['orderId'] == order['orderId'] for result in results))
        self.process_in_parallel([self.message(order, str(i)) for i in range(10)])
        records = self.assert_stock_matches_confirmed({'sku': 10, 'sku-b': 20})
        self.assertEqual([item['status'] for item in records], ['CONFIRMED'])


if __name__ == '__main__':
    unittest.main()
