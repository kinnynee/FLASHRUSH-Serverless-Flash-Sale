import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
from target_config import load, validate_runtime, TABLES
from target_config import preflight
from deploy import template
import io


class TargetTests(unittest.TestCase):
    def write(self, value):
        temp = tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        path = Path(temp.name)/'target.json'; path.write_text(json.dumps(value))
        return path

    def test_missing_inventory_and_mixed_target_fail_closed(self):
        config = {'target':'manual','account':'123456789012','region':'us-east-1','resources':{}}
        with self.assertRaisesRegex(ValueError, 'missing ProductsTable'): load(self.write(config))
        config['resources'] = {key:'configured' for key in (*TABLES,'QueueUrl')}
        self.assertEqual(load(self.write(config), 'runtime')['target'], 'manual')
        config['resources']['BusinessTable'] = 'flashrush-lab-business'
        with self.assertRaisesRegex(ValueError, 'mixed target'): load(self.write(config), 'runtime')

    def test_release_requires_cognito_and_exact_api_region(self):
        from target_config import RELEASE
        config = {'target':'lab','account':'123456789012','region':'us-east-1',
            'resources':{key:'explicit' for key in RELEASE}}
        config['resources'].pop('UserPoolClientId')
        with self.assertRaisesRegex(ValueError, 'UserPoolClientId'): load(self.write(config))
        config['resources']['UserPoolClientId'] = 'client123'
        with self.assertRaisesRegex(ValueError, 'endpoint/region'): load(self.write(config))

    def test_wrong_aws_account_stops_before_resource_access(self):
        session = Mock(region_name='us-east-1')
        session.client.return_value.get_caller_identity.return_value = {'Account':'999999999999'}
        with self.assertRaisesRegex(ValueError, 'wrong AWS account'):
            validate_runtime(session, {}, '123456789012','us-east-1')
        session.client.return_value.describe_table.assert_not_called()


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.tags = {'Project':'FLASHRUSH','Environment':'manual'}
        self.r = {name:'flashrush-manual-'+name.lower() for name in TABLES}
        self.r.update(QueueUrl='https://sqs.us-east-1.amazonaws.com/123456789012/orders',ApiId='api123',ApiUrl='https://api123.execute-api.us-east-1.amazonaws.com',
            UserPoolId='us-east-1_pool',UserPoolClientId='client',ApiFunction='api',WorkerFunction='worker',AuthorizerId='jwt',
            WebsiteBucket='site',DistributionId='dist',WebsiteUrl='https://site.cloudfront.net')
        self.config = {'resources':self.r,'target':'manual','account':'123456789012','region':'us-east-1'}
        self.clients = {name:Mock() for name in ('sts','dynamodb','sqs','cognito-idp','lambda','iam','apigatewayv2','cloudfront','s3')}
        self.session = Mock(region_name='us-east-1'); self.session.client.side_effect = self.clients.__getitem__
        self.clients['sts'].get_caller_identity.return_value = {'Account':'123456789012'}
        def describe(TableName):
            name = next(k for k,v in self.r.items() if v == TableName)
            return {'Table':{'TableArn':'arn:aws:dynamodb:us-east-1:123456789012:table/'+TableName,'TableStatus':'ACTIVE',
                'KeySchema':[{'AttributeName':k,'KeyType':v} for k,v in TABLES[name]]}}
        self.clients['dynamodb'].describe_table.side_effect = describe
        tags = [{'Key':k,'Value':v} for k,v in self.tags.items()]
        self.clients['dynamodb'].list_tags_of_resource.return_value = {'Tags':tags}
        self.clients['sqs'].get_queue_attributes.return_value = {'Attributes':{'QueueArn':'arn:aws:sqs:us-east-1:123456789012:orders'}}
        self.clients['sqs'].list_queue_tags.return_value = {'Tags':self.tags}
        c = self.clients['cognito-idp']
        c.describe_user_pool.return_value = {'UserPool':{'Arn':'arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_pool','UserPoolTags':self.tags}}
        c.describe_user_pool_client.return_value = {'UserPoolClient':{'ExplicitAuthFlows':['ALLOW_USER_PASSWORD_AUTH','ALLOW_REFRESH_TOKEN_AUTH']}}
        c.list_groups.return_value = {'Groups':[{'GroupName':g} for g in ('owner','manager','warehouse','support')]}
        self.issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool'
        env = {'PRODUCTS_TABLE':self.r['ProductsTable'],'ORDERS_TABLE':self.r['OrdersTable'],'CAMPAIGNS_TABLE':self.r['CampaignsTable'],
            'CUSTOMERS_TABLE':self.r['CustomersTable'],'BUSINESS_TABLE':self.r['BusinessTable'],'QUEUE_URL':self.r['QueueUrl'],
            'USER_POOL_ID':self.r['UserPoolId'],'USER_POOL_CLIENT_ID':'client','CUSTOMER_CLIENT_ID':'client','CUSTOMER_ISSUER':self.issuer}
        lam = self.clients['lambda']
        lam.get_function_configuration.side_effect = lambda FunctionName: {'FunctionArn':'arn:aws:lambda:us-east-1:123456789012:function:'+FunctionName,
            'Role':'arn:aws:iam::123456789012:role/runtime','Handler':'app.'+FunctionName,'State':'Active','Environment':{'Variables':env}}
        lam.list_tags.return_value = {'Tags':self.tags}
        lam.list_event_source_mappings.return_value = {'EventSourceMappings':[{'State':'Enabled','FunctionResponseTypes':['ReportBatchItemFailures']}]}
        lam.get_policy.return_value = {'Policy':json.dumps({'Statement':[{'Effect':'Allow','Action':'lambda:InvokeFunction','Principal':{'Service':'apigateway.amazonaws.com'},
            'Condition':{'ArnLike':{'AWS:SourceArn':'arn:aws:execute-api:us-east-1:123456789012:api123/*/*'}}}]})}
        self.clients['iam'].simulate_principal_policy.side_effect = lambda **kw: {'EvaluationResults':[{'EvalDecision':'allowed'} for _ in kw['ResourceArns']]}
        api = self.clients['apigatewayv2']
        api.get_api.return_value = {'ApiEndpoint':self.r['ApiUrl'],'CorsConfiguration':{'AllowOrigins':[self.r['WebsiteUrl']],
            'AllowMethods':['GET','POST','PUT','PATCH','DELETE'],'AllowHeaders':['authorization','content-type','idempotency-key','x-order-token']}}
        api.get_tags.return_value = {'Tags':self.tags}
        api.get_stages.return_value = {'Items':[{'StageName':'$default','AutoDeploy':True}]}
        api.get_authorizer.return_value = {'AuthorizerType':'JWT','JwtConfiguration':{'Issuer':self.issuer,'Audience':['client']}}
        self.routes = []
        for v in template('unused','unused')['Resources'].values():
            if v['Type'] != 'AWS::ApiGatewayV2::Route': continue
            p = v['Properties']
            self.routes.append({**p,'AuthorizerId':'jwt','Target':'integrations/i'})
        api.get_routes.return_value = {'Items':self.routes}
        api.get_integration.return_value = {'IntegrationUri':'arn:aws:lambda:us-east-1:123456789012:function:api'}
        cf = self.clients['cloudfront']
        cf.get_distribution.return_value = {'Distribution':{'ARN':'arn:aws:cloudfront::123456789012:distribution/dist','Status':'Deployed','DomainName':'site.cloudfront.net',
            'DistributionConfig':{'Origins':{'Items':[{'Id':'website','DomainName':'site.s3.us-east-1.amazonaws.com'}]},
                'DefaultCacheBehavior':{'TargetOriginId':'website','FunctionAssociations':{'Items':[{'EventType':'viewer-request','FunctionARN':'arn:function/rewrite'}]}}}}}
        cf.list_tags_for_resource.return_value = {'Tags':{'Items':tags}}
        cf.get_function.side_effect = lambda **kw: {'FunctionCode':io.BytesIO(b'account cart auth staff admin index.html')}
        self.clients['s3'].get_bucket_tagging.return_value = {'TagSet':tags}

    def test_consistent_target_passes_without_claiming_effective_aws_access(self):
        result = preflight(self.session,self.config)
        self.assertEqual(result['configuration'],'PASS')
        self.assertEqual(result['awsEndToEnd'],'NOT_VERIFIED')

    def test_staff_iam_route_and_wrong_pool_are_blocked(self):
        route = next(r for r in self.routes if r['RouteKey']=='GET /admin/vouchers')
        route['AuthorizationType'] = 'AWS_IAM'
        with self.assertRaisesRegex(ValueError,'unprotected'): preflight(self.session,self.config)
        route['AuthorizationType'] = 'JWT'
        self.clients['apigatewayv2'].get_authorizer.return_value['JwtConfiguration']['Issuer'] = 'wrong'
        with self.assertRaisesRegex(ValueError,'authorizer'): preflight(self.session,self.config)

    def test_missing_queue_mapping_or_denied_iam_blocks(self):
        self.clients['lambda'].list_event_source_mappings.return_value = {'EventSourceMappings':[]}
        with self.assertRaisesRegex(ValueError,'SQS mapping'): preflight(self.session,self.config)
        self.clients['iam'].simulate_principal_policy.side_effect = lambda **kw: {'EvaluationResults':[{'EvalDecision':'implicitDeny'}]}
        with self.assertRaisesRegex(ValueError,'IAM simulation'): preflight(self.session,self.config)

    def test_wrong_environment_tags_block_before_lambda(self):
        self.clients['dynamodb'].list_tags_of_resource.return_value = {'Tags':[{'Key':'Environment','Value':'lab'}]}
        with self.assertRaisesRegex(ValueError,'ownership tags'): preflight(self.session,self.config)
        self.clients['lambda'].get_function_configuration.assert_not_called()
