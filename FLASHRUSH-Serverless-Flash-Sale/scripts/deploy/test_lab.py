import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from deploy import template
from lab_config import connect, stack_outputs


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.args = SimpleNamespace(profile='lab', account='123456789012', region='us-east-1', stack='flashrush-lab')

    def test_wrong_account_rejected(self):
        with patch('lab_config.boto3.Session') as factory:
            factory.return_value.client.return_value.get_caller_identity.return_value = {'Account': '999999999999'}
            with self.assertRaises(SystemExit):
                connect(self.args)

    def test_wrong_stack_owner_or_region_rejected(self):
        session = Mock()
        stack = dict(StackId='arn:aws:cloudformation:us-west-2:123456789012:stack/flashrush-lab/id', Tags=[dict(Key='Project', Value='FLASHRUSH')], StackStatus='UPDATE_COMPLETE', Outputs=[])
        session.client.return_value.describe_stacks.return_value = {'Stacks': [stack]}
        with self.assertRaises(SystemExit):
            stack_outputs(session, self.args)
        stack['StackId'] = 'arn:aws:cloudformation:us-east-1:123456789012:stack/flashrush-lab/id'
        stack['Tags'] = []
        with self.assertRaises(SystemExit):
            stack_outputs(session, self.args)

    def test_spa_preserves_asset_errors(self):
        resources = template('bucket', 'key')['Resources']
        config = resources['Distribution']['Properties']['DistributionConfig']
        self.assertNotIn('CustomErrorResponses', config)
        self.assertEqual(config['DefaultCacheBehavior']['FunctionAssociations'][0]['EventType'], 'viewer-request')
        self.assertIn('products|cart|checkout', resources['SpaRewrite']['Properties']['FunctionCode'])
        self.assertIn('Worker', resources['Api']['DependsOn'])

    def test_recovery_age_and_attempt_boundaries(self):
        path = Path(__file__).resolve().parents[1] / 'ops/reconcile_pending.py'
        spec = importlib.util.spec_from_file_location('reconcile', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        item = dict(orderId='test', createdAt='1970-01-01T00:00:00+00:00', enqueueState='UNKNOWN', enqueueAttemptCount=1)
        self.assertFalse(module.inspect(item, 299, 300)['eligible'])
        self.assertTrue(module.inspect(item, 300, 300)['eligible'])
        item['enqueueAttemptCount'] = 3
        self.assertFalse(module.inspect(item, 300, 300)['eligible'])


if __name__ == '__main__':
    unittest.main()
