"""Customer infrastructure additions, preserving existing lab resources."""


def extend_customer_resources(resources, outputs):
    ref = lambda name: {'Ref': name}
    arn = lambda name: {'Fn::GetAtt': [name, 'Arn']}
    issuer = {'Fn::Sub': 'https://cognito-idp.${AWS::Region}.amazonaws.com/${CustomerPool}'}
    resources['CustomerPool'] = {'Type': 'AWS::Cognito::UserPool', 'DeletionPolicy': 'Retain', 'UpdateReplacePolicy': 'Retain', 'Properties': {
        'UserPoolName': 'flashrush-customers', 'UsernameAttributes': ['email'], 'AutoVerifiedAttributes': ['email'],
        'UsernameConfiguration': {'CaseSensitive': False}, 'DeletionProtection': 'ACTIVE',
        'Policies': {'PasswordPolicy': {'MinimumLength': 12, 'RequireUppercase': True, 'RequireLowercase': True,
                                       'RequireNumbers': True, 'RequireSymbols': True}},
        'AccountRecoverySetting': {'RecoveryMechanisms': [{'Name': 'verified_email', 'Priority': 1}]},
        'Schema': [{'Name': 'email', 'Required': True, 'Mutable': True}, {'Name': 'name', 'Mutable': True}]}}
    resources['CustomerClient'] = {'Type': 'AWS::Cognito::UserPoolClient', 'Properties': {
        'UserPoolId': ref('CustomerPool'), 'ClientName': 'flashrush-web', 'GenerateSecret': False,
        'ExplicitAuthFlows': ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
        'PreventUserExistenceErrors': 'ENABLED', 'EnableTokenRevocation': True,
        'AccessTokenValidity': 10, 'IdTokenValidity': 10, 'RefreshTokenValidity': 1,
        'TokenValidityUnits': {'AccessToken': 'minutes', 'IdToken': 'minutes', 'RefreshToken': 'days'},
        'ReadAttributes': ['email', 'email_verified', 'name', 'sub'], 'WriteAttributes': ['email', 'name']}}
    resources['CustomerData'] = {'Type': 'AWS::DynamoDB::Table', 'DeletionPolicy': 'Retain', 'UpdateReplacePolicy': 'Retain', 'Properties': {
        'TableName': 'flashrush-lab-customers', 'BillingMode': 'PAY_PER_REQUEST',
        'AttributeDefinitions': [{'AttributeName': k, 'AttributeType': 'S'} for k in ('userId', 'recordId')],
        'KeySchema': [{'AttributeName': 'userId', 'KeyType': 'HASH'}, {'AttributeName': 'recordId', 'KeyType': 'RANGE'}],
        'SSESpecification': {'SSEEnabled': True}, 'PointInTimeRecoverySpecification': {'PointInTimeRecoveryEnabled': True}}}
    resources['CustomerAuthorizer'] = {'Type': 'AWS::ApiGatewayV2::Authorizer', 'Properties': {
        'ApiId': ref('HttpApi'), 'AuthorizerType': 'JWT', 'IdentitySource': ['$request.header.Authorization'],
        'Name': 'customer-cognito', 'JwtConfiguration': {'Audience': [ref('CustomerClient')], 'Issuer': issuer}}}
    for index, route in enumerate(('GET /me/profile', 'PUT /me/profile', 'GET /me/cart', 'PUT /me/cart',
                                    'POST /me/checkouts', 'GET /me/checkouts/{checkoutId}',
                                    'GET /me/orders', 'GET /me/orders/{orderId}')):
        resources['CustomerRoute'+str(index)] = {'Type': 'AWS::ApiGatewayV2::Route', 'Properties': {
            'ApiId': ref('HttpApi'), 'RouteKey': route, 'AuthorizationType': 'JWT', 'AuthorizerId': ref('CustomerAuthorizer'),
            'AuthorizationScopes': ['aws.cognito.signin.user.admin'],
            'Target': {'Fn::Join': ['/', ['integrations', ref('Integration')]]}}}
    for name in ('Api', 'Worker'):
        resources[name]['Properties']['Environment']['Variables'].update(
            CUSTOMERS_TABLE=ref('CustomerData'), CUSTOMER_CLIENT_ID=ref('CustomerClient'), CUSTOMER_ISSUER=issuer)
    resources['ApiRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'].append({
        'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'], 'Resource': arn('CustomerData')})
    resources['WorkerRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'].extend([
        {'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:UpdateItem'], 'Resource': arn('CustomerData')},
        {'Effect': 'Allow', 'Action': ['dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:ConditionCheckItem'], 'Resource': arn('Campaigns')}])
    cors = resources['HttpApi']['Properties']['CorsConfiguration']
    cors['AllowMethods'].append('PUT')
    cors['AllowHeaders'].append('authorization')
    rewrite = resources['SpaRewrite']['Properties']
    rewrite['FunctionCode'] = rewrite['FunctionCode'].replace('products|checkout|orders|admin|monitoring', 'products|checkout|orders|admin|monitoring|cart|account|auth')
    outputs.update({name: {'Value': value} for name, value in {
        'CustomerPoolId': ref('CustomerPool'), 'CustomerClientId': ref('CustomerClient'),
        'CustomerRegion': ref('AWS::Region'), 'CustomersTable': ref('CustomerData')}.items()})
