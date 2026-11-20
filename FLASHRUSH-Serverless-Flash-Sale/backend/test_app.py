import importlib
import json
import os
import unittest
import uuid
from unittest.mock import patch

import boto3
from moto import mock_aws


@mock_aws
class BackendTests(unittest.TestCase):
    def setUp(self):
        os.environ.update(AWS_DEFAULT_REGION='us-east-1', PRODUCTS_TABLE='products', ORDERS_TABLE='orders')
        db = boto3.resource('dynamodb', region_name='us-east-1')
        for table, key in [('products', 'productId'), ('orders', 'orderId')]:
            db.create_table(TableName=table, KeySchema=[{'AttributeName': key, 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': key, 'AttributeType': 'S'}], BillingMode='PAY_PER_REQUEST')
        sqs = boto3.client('sqs', region_name='us-east-1')
        os.environ['QUEUE_URL'] = sqs.create_queue(QueueName='orders')['QueueUrl']
        import app
        self.app = importlib.reload(app)
        self.app.products.put_item(Item={'productId': 'sku', 'stock': 10})

    def post(self, key=None, payload=None):
        key = key or str(uuid.uuid4())
        result = self.app.api({'requestContext': {'http': {'method': 'POST'}}, 'rawPath': '/orders',
            'headers': {'Idempotency-Key': key}, 'body': json.dumps(payload or {'productId': 'sku', 'quantity': 1})}, None)
        return key, result, json.loads(result['body'])

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
        self.app.process({'schemaVersion': '1.0', **{k: item[k] for k in ('orderId', 'productId', 'quantity')}})
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
        for quantity in [0, -1, True, '1', 2]:
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
        self.assertEqual(self.app.orders.scan()['Count'], 1)

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


if __name__ == '__main__':
    unittest.main()
