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

    def test_admin_routes_require_iam(self):
        routes = {resource['Properties']['RouteKey']: resource['Properties']
                  for resource in template('bucket', 'key')['Resources'].values()
                  if resource['Type'] == 'AWS::ApiGatewayV2::Route'}
        for route in ('POST /admin/campaigns', 'PATCH /admin/campaigns/{campaignId}'):
            self.assertEqual(routes[route]['AuthorizationType'], 'AWS_IAM')
        for route in ('GET /products', 'GET /campaigns', 'POST /orders', 'GET /orders/{orderId}'):
            self.assertEqual(routes[route]['AuthorizationType'], 'NONE')

    def test_shared_module_environment_for_both_handlers(self):
        resources = template('bucket', 'key')['Resources']
        for name in ('Api', 'Worker'):
            variables = resources[name]['Properties']['Environment']['Variables']
            for key in ('PRODUCTS_TABLE', 'ORDERS_TABLE', 'CAMPAIGNS_TABLE', 'QUEUE_URL'):
                self.assertIn(key, variables)

    def test_monitoring_read_permissions_and_environment(self):
        resources = template('bucket', 'key')['Resources']
        statements = resources['ApiRole']['Properties']['Policies'][0]['PolicyDocument']['Statement']
        self.assertTrue(any('cloudwatch:GetMetricData' in entry['Action'] for entry in statements))
        variables = resources['Api']['Properties']['Environment']['Variables']
        self.assertEqual(variables['MONITORING_WORKER_FUNCTION'], 'flashrush-lab-worker')
        routes = [r['Properties'] for r in resources.values() if r['Type'] == 'AWS::ApiGatewayV2::Route']
        route = next(r for r in routes if r['RouteKey'] == 'GET /admin/monitoring')
        self.assertEqual(route['AuthorizationType'], 'NONE')  # Backend validates the admin key before CloudWatch access.

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

    def test_customer_routes_require_cognito_access_scope(self):
        config = template('bucket', 'key')
        resources = config['Resources']
        routes = [r['Properties'] for r in resources.values() if r['Type'] == 'AWS::ApiGatewayV2::Route' and '/me/' in r['Properties']['RouteKey']]
        self.assertEqual(len(routes), 11)
        for route in routes:
            self.assertEqual(route['AuthorizationType'], 'JWT')
            self.assertEqual(route['AuthorizationScopes'], ['aws.cognito.signin.user.admin'])
        self.assertFalse(resources['CustomerClient']['Properties']['GenerateSecret'])
        self.assertEqual(resources['CustomerData']['DeletionPolicy'], 'Retain')
        self.assertTrue(resources['CustomerData']['Properties']['PointInTimeRecoverySpecification']['PointInTimeRecoveryEnabled'])
        for function in ('Api', 'Worker'):
            self.assertEqual(resources[function]['Properties']['Environment']['Variables']['CUSTOMERS_TABLE'], {'Ref': 'CustomerData'})
        self.assertIn('account', resources['SpaRewrite']['Properties']['FunctionCode'])


if __name__ == '__main__':
    unittest.main()
