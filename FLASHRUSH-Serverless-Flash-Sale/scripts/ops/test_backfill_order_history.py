import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import boto3
from moto import mock_aws
import test_customer
from backfill_order_history import backfill


class BackfillTests(unittest.TestCase):
    @mock_aws
    def test_dry_run_idempotency_ownership_and_legacy_worker(self):
        fixture = test_customer.CustomerTests(); fixture.setUp()
        item = {'orderId':'legacy','customerId':'alice','productId':'one','quantity':1,'status':'PENDING',
                'createdAt':'2025-01-01T00:00:00+00:00','updatedAt':'2025-01-01T00:00:00+00:00'}
        fixture.app.orders.put_item(Item=item)
        fixture.app.orders.put_item(Item={**item,'orderId':'guest','customerId':''})
        resources = {'OrdersTable':'orders','CustomersTable':'customers'}
        session = boto3.DEFAULT_SESSION
        report = backfill(session, resources)
        self.assertEqual(report['candidates'],1)
        self.assertEqual(fixture.request('GET','/me/orders')[1]['items'],[])
        self.assertEqual(backfill(session, resources, True)['indexed'],1)
        self.assertEqual(backfill(session, resources, True)['existing'],1)
        self.assertEqual(fixture.request('GET','/me/orders')[1]['items'][0]['orderId'],'legacy')
        self.assertEqual(fixture.request('GET','/me/orders',user='bob')[1]['items'],[])
        self.assertEqual(fixture.app.read_order('legacy'),item)
        fixture.app.process({'schemaVersion':'1.0','orderId':'legacy','productId':'one','quantity':1})
        self.assertEqual(fixture.app.read_order('legacy')['status'],'CONFIRMED')
