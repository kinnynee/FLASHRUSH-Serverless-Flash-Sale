"""Explicit, read-only target validation shared by release and recovery tools."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

TABLES = {'ProductsTable': [('productId', 'HASH')], 'OrdersTable': [('orderId', 'HASH')],
          'CampaignsTable': [('campaignId', 'HASH')], 'CustomersTable': [('userId', 'HASH'), ('recordId', 'RANGE')],
          'BusinessTable': [('id', 'HASH')]}
RUNTIME = (*TABLES, 'QueueUrl')
RELEASE = (*RUNTIME, 'ApiId', 'ApiUrl', 'ApiFunction', 'WorkerFunction', 'UserPoolId',
           'UserPoolClientId', 'AuthorizerId', 'WebsiteBucket', 'DistributionId', 'WebsiteUrl')


def require(condition, message):
    if not condition:
        raise ValueError('INCOMPLETE_CONFIGURATION: ' + message)


def load(path, purpose='release'):
    config = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    require(config.get('target') in ('manual', 'lab'), 'explicit target manual or lab required')
    require(re.fullmatch(r'\d{12}', str(config.get('account', ''))), 'account required')
    require(re.fullmatch(r'[a-z]{2}(?:-gov)?-[a-z]+-\d', config.get('region', '')), 'region required')
    resources = config.get('resources', {})
    for name in RELEASE if purpose == 'release' else RUNTIME:
        require(isinstance(resources.get(name), str) and bool(resources[name].strip()), 'missing ' + name)
        require('\n' not in resources[name] and '\r' not in resources[name], 'invalid multiline identifier: ' + name)
    opposite = 'flashrush-lab-' if config['target'] == 'manual' else 'flashrush-manual-'
    require(not any(opposite in str(value) for value in resources.values()), 'mixed target resource identifiers')
    if purpose == 'release':
        require(re.fullmatch(r'[a-z0-9]+', resources['ApiId']), 'invalid API ID')
        host = f"{resources['ApiId']}.execute-api.{config['region']}.amazonaws.com"
        require(resources['ApiUrl'] == 'https://' + host, 'API endpoint/region/id mismatch (use default endpoint)')
        require(resources['UserPoolId'].startswith(config['region'] + '_'), 'Cognito region mismatch')
        require(re.fullmatch(r'[a-z0-9]{1,128}', resources['UserPoolClientId']), 'invalid public Cognito client ID')
        site = urlsplit(resources['WebsiteUrl'])
        require(site.scheme == 'https' and bool(site.netloc) and not site.query and site.path in ('', '/'), 'invalid website URL')
    return config


def check_tags(tags, target, label):
    require(tags.get('Project') == 'FLASHRUSH' and tags.get('Environment') == target, label + ' target ownership tags missing/mismatch')


def validate_runtime(session, resources, account, region, target=None):
    require(session.client('sts').get_caller_identity()['Account'] == account, 'wrong AWS account')
    require(session.region_name == region, 'wrong session region')
    db = session.client('dynamodb')
    for name, schema in TABLES.items():
        require(bool(resources.get(name)), 'missing ' + name)
        table = db.describe_table(TableName=resources[name])['Table']
        require(table['TableArn'].split(':')[3:5] == [region, account], name + ' account/region mismatch')
        require(table['TableStatus'] == 'ACTIVE', name + ' not active')
        require(sorted((k['AttributeName'], k['KeyType']) for k in table['KeySchema']) == sorted(schema), name + ' key schema mismatch')
        if target:
            tags = db.list_tags_of_resource(ResourceArn=table['TableArn'])['Tags']
            check_tags({t['Key']:t['Value'] for t in tags}, target, name)
    queue = resources.get('QueueUrl', '')
    require(urlsplit(queue).hostname == f'sqs.{region}.amazonaws.com' and urlsplit(queue).path.startswith('/' + account + '/'), 'queue account/region mismatch')
    arn = session.client('sqs').get_queue_attributes(QueueUrl=queue, AttributeNames=['QueueArn'])['Attributes']['QueueArn']
    require(arn.split(':')[3:5] == [region, account], 'queue ARN mismatch')
    if target:
        check_tags(session.client('sqs').list_queue_tags(QueueUrl=queue).get('Tags',{}), target, 'queue')
    return arn


def pages(client, operation, key, **kwargs):
    while True:
        page = getattr(client, operation)(**kwargs)
        yield from page.get(key, [])
        token = page.get('NextToken') or page.get('NextMarker') or (page.get('Marker') if page.get('IsTruncated') else None)
        if not token:
            break
        kwargs['NextToken' if 'NextToken' in page else 'Marker'] = token


def preflight(session, config):
    r, region, account = config['resources'], config['region'], config['account']
    queue_arn = validate_runtime(session, r, account, region, config['target'])
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{r['UserPoolId']}"
    cognito = session.client('cognito-idp')
    pool = cognito.describe_user_pool(UserPoolId=r['UserPoolId'])['UserPool']
    require(pool['Arn'].split(':')[3:5] == [region, account], 'Cognito pool account mismatch')
    check_tags(pool.get('UserPoolTags',{}), config['target'], 'Cognito pool')
    client = cognito.describe_user_pool_client(UserPoolId=r['UserPoolId'], ClientId=r['UserPoolClientId'])['UserPoolClient']
    require(not client.get('ClientSecret'), 'browser client must not have secret')
    require({'ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'} <= set(client.get('ExplicitAuthFlows', [])), 'Cognito auth flows missing')
    groups = {g['GroupName'] for g in pages(cognito, 'list_groups', 'Groups', UserPoolId=r['UserPoolId'])}
    require({'owner', 'manager', 'warehouse', 'support'} <= groups, 'staff groups missing')
    lam = session.client('lambda')
    functions = {}
    for key, handler in (('ApiFunction', 'app.api'), ('WorkerFunction', 'app.worker')):
        fn = lam.get_function_configuration(FunctionName=r[key]); functions[key] = fn
        require(fn['FunctionArn'].split(':')[3:5] == [region, account], key + ' account/region mismatch')
        check_tags(lam.list_tags(Resource=fn['FunctionArn']).get('Tags',{}), config['target'], key)
        require(fn['Handler'] == handler and fn.get('State') == 'Active', key + ' handler/state mismatch')
        env = fn.get('Environment', {}).get('Variables', {})
        expected = {name: r[table] for name, table in [('PRODUCTS_TABLE','ProductsTable'), ('ORDERS_TABLE','OrdersTable'),
            ('CAMPAIGNS_TABLE','CampaignsTable'), ('CUSTOMERS_TABLE','CustomersTable'), ('BUSINESS_TABLE','BusinessTable'),
            ('QUEUE_URL','QueueUrl'), ('USER_POOL_ID','UserPoolId'), ('USER_POOL_CLIENT_ID','UserPoolClientId'), ('CUSTOMER_CLIENT_ID','UserPoolClientId')]}
        expected['CUSTOMER_ISSUER'] = issuer
        require(all(env.get(k) == v for k, v in expected.items()), key + ' environment mismatch')
        role = fn['Role']
        require(role.split(':')[4] == account, key + ' IAM account mismatch')
        session.client('iam').get_role(RoleName=role.rsplit('/', 1)[-1])
        iam = session.client('iam')
        table_arns = [f'arn:aws:dynamodb:{region}:{account}:table/{r[name]}' for name in TABLES]
        checks = [('dynamodb:GetItem',table_arns), ('dynamodb:UpdateItem',[table_arns[i] for i in (0,1,3,4)])]
        if key == 'ApiFunction':
            checks += [('dynamodb:PutItem',[table_arns[i] for i in (0,1,2,3,4)]), ('sqs:SendMessage',[queue_arn]),
                       ('dynamodb:Query',[table_arns[3]]), ('cognito-idp:AdminGetUser',[pool['Arn']]),
                       ('cognito-idp:AdminListGroupsForUser',[pool['Arn']])]
        else:
            checks += [('dynamodb:PutItem',[table_arns[4]]), ('dynamodb:ConditionCheckItem',[table_arns[2]]),
                       ('sqs:ReceiveMessage',[queue_arn]), ('sqs:DeleteMessage',[queue_arn])]
        for action, resource_arns in checks:
            evaluated = list(pages(iam,'simulate_principal_policy','EvaluationResults',PolicySourceArn=role,ActionNames=[action],ResourceArns=resource_arns))
            require(len(evaluated) == len(resource_arns) and all(v['EvalDecision'] == 'allowed' for v in evaluated), key + ' IAM simulation denied: ' + action)
    mappings = list(pages(lam, 'list_event_source_mappings', 'EventSourceMappings', FunctionName=r['WorkerFunction'], EventSourceArn=queue_arn))
    require(any(m['State'] == 'Enabled' and 'ReportBatchItemFailures' in m.get('FunctionResponseTypes', []) for m in mappings), 'worker SQS mapping missing')
    api = session.client('apigatewayv2')
    actual_api = api.get_api(ApiId=r['ApiId'])
    require(actual_api['ApiEndpoint'] == r['ApiUrl'], 'API endpoint mismatch')
    cors = actual_api.get('CorsConfiguration', {})
    require(r['WebsiteUrl'].rstrip('/') in cors.get('AllowOrigins',[]) or '*' in cors.get('AllowOrigins',[]), 'website CORS origin missing')
    require({'GET','POST','PUT','PATCH','DELETE'} <= set(cors.get('AllowMethods',[])), 'CORS methods missing')
    require({'authorization','content-type','idempotency-key','x-order-token'} <= {h.lower() for h in cors.get('AllowHeaders',[])}, 'CORS headers missing')
    check_tags(api.get_tags(ResourceArn=f"arn:aws:apigateway:{region}::/apis/{r['ApiId']}").get('Tags',{}), config['target'], 'API')
    stages = list(pages(api,'get_stages','Items',ApiId=r['ApiId']))
    require(any(s['StageName'] == '$default' and s.get('AutoDeploy') for s in stages), 'default auto-deploy stage required')
    policy = json.loads(lam.get_policy(FunctionName=r['ApiFunction'])['Policy'])
    source_prefix = f"arn:aws:execute-api:{region}:{account}:{r['ApiId']}/"
    require(any(s.get('Effect') == 'Allow' and s.get('Principal',{}).get('Service') == 'apigateway.amazonaws.com' and
                s.get('Action') == 'lambda:InvokeFunction' and
                s.get('Condition',{}).get('ArnLike',{}).get('AWS:SourceArn','').startswith(source_prefix)
                for s in policy['Statement']), 'API Lambda invoke permission missing')
    auth = api.get_authorizer(ApiId=r['ApiId'], AuthorizerId=r['AuthorizerId'])
    require(auth['AuthorizerType'] == 'JWT' and auth['JwtConfiguration']['Issuer'] == issuer and
            auth['JwtConfiguration']['Audience'] == [r['UserPoolClientId']], 'JWT authorizer mismatch')
    from deploy import template
    expected_routes = {v['Properties']['RouteKey']: v['Properties'] for v in template('unused','unused')['Resources'].values() if v['Type'] == 'AWS::ApiGatewayV2::Route'}
    routes = {v['RouteKey']: v for v in pages(api, 'get_routes', 'Items', ApiId=r['ApiId'])}
    for key, route in routes.items():
        if '/admin/' in key or '/me/' in key:
            require(route.get('AuthorizationType') == 'JWT' and route.get('AuthorizerId') == r['AuthorizerId'] and
                    route.get('AuthorizationScopes') == ['aws.cognito.signin.user.admin'], 'unprotected extra route: ' + key)
    for key, expected in expected_routes.items():
        route = routes.get(key, {})
        require(route.get('AuthorizationType') == expected.get('AuthorizationType'), 'route missing/auth mismatch: ' + key)
        if expected.get('AuthorizationType') == 'JWT':
            require(route.get('AuthorizerId') == r['AuthorizerId'] and route.get('AuthorizationScopes') == ['aws.cognito.signin.user.admin'], 'JWT scope mismatch: ' + key)
        integration = api.get_integration(ApiId=r['ApiId'], IntegrationId=route.get('Target', '/').split('/')[-1])
        require(integration.get('IntegrationUri') == functions['ApiFunction']['FunctionArn'], 'route Lambda mismatch: ' + key)
    cf = session.client('cloudfront')
    dist = cf.get_distribution(Id=r['DistributionId'])['Distribution']
    require(dist['ARN'].split(':')[4] == account and dist['Status'] == 'Deployed', 'distribution account/status mismatch')
    check_tags({t['Key']:t['Value'] for t in cf.list_tags_for_resource(Resource=dist['ARN'])['Tags'].get('Items',[])}, config['target'], 'distribution')
    dc = dist['DistributionConfig']
    require(urlsplit(r['WebsiteUrl']).hostname in [dist['DomainName'], *dc.get('Aliases', {}).get('Items', [])], 'website/distribution mismatch')
    require(any(o['Id'] == dc['DefaultCacheBehavior']['TargetOriginId'] and o['DomainName'].startswith(r['WebsiteBucket'] + '.s3.') for o in dc['Origins']['Items']), 'distribution bucket mismatch')
    functions_cf = dc['DefaultCacheBehavior'].get('FunctionAssociations', {}).get('Items', [])
    viewer = next((f for f in functions_cf if f['EventType'] == 'viewer-request'), None)
    require(viewer is not None, 'SPA viewer-request rewrite missing')
    code = cf.get_function(Name=viewer['FunctionARN'].rsplit('/',1)[-1], Stage='LIVE')['FunctionCode'].read().decode()
    require(all(word in code for word in ('account','cart','auth','staff','admin','index.html')), 'SPA rewrite missing customer/staff paths')
    session.client('s3').head_bucket(Bucket=r['WebsiteBucket'], ExpectedBucketOwner=account)
    check_tags({t['Key']:t['Value'] for t in session.client('s3').get_bucket_tagging(Bucket=r['WebsiteBucket'])['TagSet']}, config['target'], 'website bucket')
    return {'configuration': 'PASS', 'iamSimulation':'PASS', 'iamEffectivePermissions': 'NOT_VERIFIED', 'awsEndToEnd': 'NOT_VERIFIED'}


def frontend_env(config):
    r = config['resources']
    return {'VITE_ORDER_MODE':'http', 'VITE_API_BASE_URL':r['ApiUrl'], 'VITE_COGNITO_CLIENT_ID':r['UserPoolClientId'],
            'VITE_COGNITO_REGION':config['region'], 'VITE_DEMO_SERVICE_ERROR':'false'}
