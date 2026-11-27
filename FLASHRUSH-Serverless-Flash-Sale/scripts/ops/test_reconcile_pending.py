import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import boto3
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import test_customer
import reconcile_pending


class VoucherRecoveryTests(unittest.TestCase):
    @mock_aws
    def test_recovery_resolves_business_table_from_stack_and_redeems_once(self):
        fixture = test_customer.CustomerTests()
        fixture.setUp()
        import customer
        selection = fixture.priced_selection([1800000, 1800000])
        _, checkout, _ = fixture.checkout({**selection, 'addressId': 'home', 'expectedTotal': 2268000})
        for order in checkout['orders']:
            fixture.app.orders.update_item(Key={'orderId': order['orderId']},
                UpdateExpression='SET createdAt=:old', ExpressionAttributeValues={':old': '2000-01-01T00:00:00+00:00'})
        outputs = {'ProductsTable': 'products', 'OrdersTable': 'orders', 'CampaignsTable': 'campaigns',
                   'CustomersTable': 'customers', 'BusinessTable': 'business', 'QueueUrl': os.environ['QUEUE_URL']}
        args = SimpleNamespace(min_age_seconds=30, namespace=None, inventory=None, resend=False, recover=True, output=None,
                               account='123456789012', region='us-east-1')
        cli = Mock()
        cli.parse_args.return_value = args
        session = boto3.DEFAULT_SESSION
        with patch.dict(os.environ), patch.object(reconcile_pending, 'parser', return_value=cli), \
                patch.object(reconcile_pending, 'connect', return_value=session), \
                patch.object(reconcile_pending, 'stack_outputs', return_value=outputs), patch('builtins.print'), \
                patch.object(customer,'process_checkout',wraps=customer.process_checkout) as process:
            os.environ.pop('BUSINESS_TABLE', None)
            self.assertEqual(reconcile_pending.main(), 0)
            self.assertEqual(os.environ['BUSINESS_TABLE'], 'business')
            self.assertEqual(process.call_count, 1)
            self.assertEqual(reconcile_pending.main(), 0)
            self.assertEqual(process.call_count, 1)
        for order in checkout['orders']:
            self.assertEqual(fixture.app.read_order(order['orderId'])['status'], 'CONFIRMED')
        record = boto3.resource('dynamodb').Table('business').get_item(Key={'id': 'voucher#FLASH37'})['Item']
        self.assertEqual(record['usedCount'], 1)

    @mock_aws
    def test_group_technical_failure_is_reported_once_and_leaves_pending(self):
        fixture = test_customer.CustomerTests(); fixture.setUp()
        import customer
        selection = fixture.priced_selection([1800000,1800000])
        _, checkout, _ = fixture.checkout({**selection,'addressId':'home','expectedTotal':2268000})
        for order in checkout['orders']:
            fixture.app.orders.update_item(Key={'orderId':order['orderId']},UpdateExpression='SET createdAt=:old',ExpressionAttributeValues={':old':'2000-01-01T00:00:00+00:00'})
        outputs = {'ProductsTable':'products','OrdersTable':'orders','CampaignsTable':'campaigns','CustomersTable':'customers','BusinessTable':'business','QueueUrl':os.environ['QUEUE_URL']}
        args = SimpleNamespace(min_age_seconds=30,namespace=None,inventory=None,resend=False,recover=True,output=None,account='123456789012',region='us-east-1')
        cli = Mock(); cli.parse_args.return_value = args
        with patch.object(reconcile_pending,'parser',return_value=cli), patch.object(reconcile_pending,'connect',return_value=boto3.DEFAULT_SESSION), patch.object(reconcile_pending,'stack_outputs',return_value=outputs), patch.object(customer,'process_checkout',side_effect=TimeoutError) as process, patch('builtins.print') as printed:
            self.assertEqual(reconcile_pending.main(),2)
            self.assertEqual(process.call_count,1)
            self.assertIn('retry_required',str(printed.call_args_list))
        for order in checkout['orders']:
            self.assertEqual(fixture.app.read_order(order['orderId'])['status'],'PENDING')

    def test_manual_mode_without_inventory_never_connects(self):
        with patch('sys.argv',['reconcile_pending.py','--namespace','flashrush-manual']), patch.object(reconcile_pending,'connect') as connect:
            with self.assertRaises(SystemExit): reconcile_pending.main()
            connect.assert_not_called()
