import copy
from datetime import datetime, timedelta
import importlib
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import boto3
from moto import mock_aws

from campaigns import ROOT, apply, inspect, instant, read, record


class CampaignSeedTests(unittest.TestCase):
    def setUp(self):
        self.plan = read(ROOT / 'scripts/seed/campaigns-2026.json')
        self.snapshot = read(ROOT / 'scripts/seed/catalog-snapshot-2026-11-27.json')
        self.at = instant('2026-11-27T12:00:00+07:00')

    def check(self, plan=None, products=None, existing=None):
        return inspect(plan or self.plan,
                       self.snapshot['products'] if products is None else products,
                       self.snapshot['campaigns'] if existing is None else existing, self.at)

    def test_full_plan_has_no_missing_products_or_overlap(self):
        result = self.check()
        self.assertEqual(len(result['additions']), 20)
        self.assertEqual(result['errors'], [])
        self.assertEqual(result['warnings'], [])
        self.assertTrue(result['readyToApply'])
        self.assertEqual(result['selectorBlockers'], [])

    def test_identical_rerun_is_noop_and_admin_changes_are_preserved(self):
        existing = self.snapshot['campaigns'] + [record(c) for c in self.plan['campaigns']]
        self.assertEqual(self.check(existing=existing)['additions'], [])
        existing[-1]['name'] = 'Administrator edit'
        result = self.check(existing=existing)
        self.assertTrue(any('refusing overwrite' in e for e in result['errors']))
        self.assertEqual(existing[-1]['name'], 'Administrator edit')

    def test_missing_product_blocks_entire_plan(self):
        result = self.check(products=[])
        self.assertTrue(any('Missing product' in e for e in result['errors']))
        self.assertFalse(result['readyToApply'])

    def test_inclusive_boundary_overlap_is_rejected(self):
        plan = copy.deepcopy(self.plan)
        first, second = plan['campaigns'][:2]
        second['productIds'] = first['productIds']
        second['startTime'] = first['endTime']
        self.assertTrue(any('Overlap' in e for e in self.check(plan=plan)['errors']))

    def test_duplicate_and_bad_quantity_are_rejected(self):
        plan = copy.deepcopy(self.plan)
        plan['campaigns'][0]['maxQtyPerOrder'] = True
        plan['campaigns'].append(plan['campaigns'][0])
        errors = self.check(plan=plan)['errors']
        self.assertTrue(any('Duplicate ID' in e for e in errors))
        self.assertTrue(any('Invalid campaign' in e for e in errors))

    def test_apply_blocks_before_any_write(self):
        sys.path.insert(0, str(ROOT / 'scripts/deploy'))
        session = Mock()
        with patch('lab_config.connect', return_value=session), patch(
                'lab_config.stack_outputs', return_value=self.plan['target']), patch(
                'campaigns.scan', side_effect=[[], self.snapshot['campaigns']]), patch(
                'campaigns.datetime', wraps=datetime) as clock:
            clock.now.return_value = self.at
            with self.assertRaisesRegex(ValueError, 'Apply blocked'):
                apply(self.plan, SimpleNamespace())
        session.client.assert_not_called()

    @mock_aws
    def test_real_backend_schema_and_campaign_transitions(self):
        sys.path.insert(0, str(ROOT / 'backend'))
        with patch.dict(os.environ, {'AWS_DEFAULT_REGION': 'us-east-1',
                'PRODUCTS_TABLE': 'seed-products', 'ORDERS_TABLE': 'seed-orders',
                'CAMPAIGNS_TABLE': 'seed-campaigns'}):
            import app
            backend = importlib.reload(app)
            db = boto3.resource('dynamodb', region_name='us-east-1')
            for table, key in [('seed-products', 'productId'), ('seed-campaigns', 'campaignId')]:
                db.create_table(TableName=table, KeySchema=[{'AttributeName': key, 'KeyType': 'HASH'}],
                    AttributeDefinitions=[{'AttributeName': key, 'AttributeType': 'S'}],
                    BillingMode='PAY_PER_REQUEST')
            for product in self.snapshot['products']:
                backend.products.put_item(Item=product)
            combined = self.snapshot['campaigns'] + [record(c) for c in self.plan['campaigns']]
            for item in combined:
                backend.campaigns.put_item(Item=item)
            for item in self.plan['campaigns']:
                parsed = backend.campaign_payload(item, self.at)
                self.assertEqual(parsed['status'], 'UPCOMING')
                self.assertNotIn('description', parsed)
                at = instant(item['startTime'])
                self.assertEqual(backend.public_campaign(item, at)['saleStatus'], 'LIVE')
                for pid in item['productIds']:
                    product = next(p for p in self.snapshot['products'] if p['productId'] == pid)
                    public = backend.public_product(product, at, combined)
                    self.assertEqual(public['saleStatus'], 'LIVE')
                    self.assertEqual(instant(public['saleStartsAt']), at)
                    self.assertIsNone(backend.active_campaign_limit(pid, 1, at))
                    self.assertEqual(backend.active_campaign_limit(pid, 2, at), 'CAMPAIGN_QUANTITY_LIMIT')
            gap = instant('2026-12-03T12:00:00+07:00')
            product = next(p for p in self.snapshot['products'] if p['productId'] == 'keychron-k2')
            self.assertEqual(backend.public_product(product, gap, combined)['saleStatus'], 'UPCOMING')
            self.assertEqual(backend.public_campaign(self.plan['campaigns'][0], gap)['saleStatus'], 'UPCOMING')
            for pid in {pid for c in self.plan['campaigns'] for pid in c['productIds']}:
                matches = [c for c in combined if pid in c['productIds']]
                product = next(p for p in self.snapshot['products'] if p['productId'] == pid)
                for c in matches:
                    for probe in (instant(c['startTime']), instant(c['endTime']) + timedelta(microseconds=1)):
                        active = [m for m in matches if instant(m['startTime']) <= probe <= instant(m['endTime'])]
                        future = [m for m in matches if instant(m['startTime']) > probe]
                        if active:
                            expected = min(active, key=lambda m: (instant(m['startTime']), m['campaignId']))
                        elif future:
                            expected = min(future, key=lambda m: (instant(m['startTime']), m['campaignId']))
                        else:
                            expected = max(matches, key=lambda m: instant(m['endTime']))
                        actual = backend.public_product(product, probe, matches)
                        self.assertEqual(instant(actual['saleStartsAt']), instant(expected['startTime']))
                        self.assertEqual(instant(actual['saleEndsAt']), instant(expected['endTime']))


if __name__ == '__main__':
    unittest.main()
