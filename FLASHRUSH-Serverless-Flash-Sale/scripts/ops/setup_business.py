"""Provision identity/inventory dependencies; explicit execute. Never changes stock."""
import argparse
import json
import sys
from pathlib import Path
import boto3

ROOT=Path(__file__).resolve().parents[2]
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('profile','region','account','namespace'):p.add_argument('--'+name,required=True)
    p.add_argument('--owner-email',help='Existing confirmed Cognito account to promote. Does not send invitation.')
    p.add_argument('--enable-bearer-admin',action='store_true',help='After new backend deployment, replace AWS_IAM with backend-verified bearer on existing admin routes')
    p.add_argument('--execute',action='store_true');a=p.parse_args()
    if a.namespace not in ('flashrush-lab','flashrush-manual'):p.error('Unknown namespace')
    if not a.execute:print('Dry run. Creates Cognito pool/client/groups and business journal, adds API dependencies; does not deploy code or seed stock.');return
    s=boto3.Session(profile_name=a.profile,region_name=a.region)
    if s.client('sts').get_caller_identity()['Account']!=a.account:raise SystemExit('Account mismatch')
    if a.namespace == 'flashrush-lab':
        stack=s.client('cloudformation').describe_stacks(StackName='flashrush-lab')['Stacks'][0]
        outputs={v['OutputKey']:v['OutputValue'] for v in stack.get('Outputs',[])}
        if 'BusinessTable' not in outputs:raise SystemExit('Use CloudFormation migration for this managed stack')
        if a.owner_email:
            c=s.client('cognito-idp');pool=outputs['UserPoolId'];u=c.admin_get_user(UserPoolId=pool,Username=a.owner_email)
            if u['UserStatus']!='CONFIRMED':raise SystemExit('Owner must be confirmed')
            c.admin_add_user_to_group(UserPoolId=pool,Username=a.owner_email,GroupName='owner')
        print('Existing CloudFormation business resources preserved');return
    n=a.namespace; c=s.client('cognito-idp'); db=s.client('dynamodb'); l=s.client('lambda'); iam=s.client('iam'); api=s.client('apigatewayv2')
    pools=[];token=None
    while True:
        page=c.list_user_pools(MaxResults=60,**({'NextToken':token} if token else {}));pools.extend(x for x in page['UserPools'] if x['Name']==n+'-users');token=page.get('NextToken')
        if not token:break
    if len(pools)>1:raise SystemExit('Ambiguous pools')
    pool=pools[0]['Id'] if pools else c.create_user_pool(PoolName=n+'-users',UsernameAttributes=['email'],AutoVerifiedAttributes=['email'],UsernameConfiguration={'CaseSensitive':False},Policies={'PasswordPolicy':{'MinimumLength':12,'RequireLowercase':True,'RequireUppercase':True,'RequireNumbers':True,'RequireSymbols':True}},AccountRecoverySetting={'RecoveryMechanisms':[{'Name':'verified_email','Priority':1}]})['UserPool']['Id']
    clients=c.list_user_pool_clients(UserPoolId=pool,MaxResults=60)['UserPoolClients'];clients=[x for x in clients if x['ClientName']=='flashrush-web']
    client=clients[0]['ClientId'] if clients else c.create_user_pool_client(UserPoolId=pool,ClientName='flashrush-web',GenerateSecret=False,ExplicitAuthFlows=['ALLOW_USER_PASSWORD_AUTH','ALLOW_REFRESH_TOKEN_AUTH'],PreventUserExistenceErrors='ENABLED',EnableTokenRevocation=True,AccessTokenValidity=1,TokenValidityUnits={'AccessToken':'hours'})['UserPoolClient']['ClientId']
    for group in ('owner','manager','warehouse','support'):
        try:c.get_group(UserPoolId=pool,GroupName=group)
        except c.exceptions.ResourceNotFoundException:c.create_group(UserPoolId=pool,GroupName=group)
    table=n+'-business'
    try:db.describe_table(TableName=table)
    except db.exceptions.ResourceNotFoundException:
        db.create_table(TableName=table,BillingMode='PAY_PER_REQUEST',KeySchema=[{'AttributeName':'id','KeyType':'HASH'}],AttributeDefinitions=[{'AttributeName':'id','AttributeType':'S'}]);db.get_waiter('table_exists').wait(TableName=table)
    config=l.get_function_configuration(FunctionName=n+'-api');role=config['Role'].split('/')[-1]
    pool_arn=f'arn:aws:cognito-idp:{a.region}:{a.account}:userpool/{pool}'
    policy={'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Scan'],'Resource':f'arn:aws:dynamodb:{a.region}:{a.account}:table/{table}'},{'Effect':'Allow','Action':['cognito-idp:ListUsers','cognito-idp:AdminGetUser','cognito-idp:AdminListGroupsForUser','cognito-idp:AdminCreateUser','cognito-idp:AdminAddUserToGroup','cognito-idp:AdminRemoveUserFromGroup','cognito-idp:AdminEnableUser','cognito-idp:AdminDisableUser','cognito-idp:AdminUpdateUserAttributes'],'Resource':pool_arn}]}
    iam.put_role_policy(RoleName=role,PolicyName='flashrush-business',PolicyDocument=json.dumps(policy))
    env=config['Environment']['Variables'];env.update(BUSINESS_TABLE=table,USER_POOL_ID=pool,USER_POOL_CLIENT_ID=client)
    l.update_function_configuration(FunctionName=n+'-api',Environment={'Variables':env});l.get_waiter('function_updated_v2').wait(FunctionName=n+'-api')
    match=[x for x in api.get_apis()['Items'] if x['Name']==n+'-api']
    if len(match)!=1:raise SystemExit('Ambiguous API')
    aid=match[0]['ApiId']; routes=api.get_routes(ApiId=aid)['Items'];target=next(x['Target'] for x in routes if x['RouteKey']=='GET /products')
    addon=json.loads((ROOT/'infrastructure/templates/business-extension.json').read_text(encoding='utf-8'))
    for resource in addon['Resources'].values():
        if resource['Type']!='AWS::ApiGatewayV2::Route':continue
        key=resource['Properties']['RouteKey']
        if not any(r['RouteKey']==key for r in routes):api.create_route(ApiId=aid,RouteKey=key,Target=target,AuthorizationType='NONE')
    if a.enable_bearer_admin:
        for route in routes:
            if '/admin/' in route['RouteKey']:
                api.update_route(ApiId=aid,RouteId=route['RouteId'],AuthorizationType='NONE')
    try:
        l.add_permission(FunctionName=n+'-api',StatementId='business-api-routes',Action='lambda:InvokeFunction',Principal='apigateway.amazonaws.com',SourceArn=f'arn:aws:execute-api:{a.region}:{a.account}:{aid}/*')
    except l.exceptions.ResourceConflictException:pass

    cors=api.get_api(ApiId=aid)['CorsConfiguration'];cors['AllowHeaders']=list(dict.fromkeys(cors.get('AllowHeaders',[])+['authorization']));api.update_api(ApiId=aid,CorsConfiguration=cors)
    if a.owner_email:
        user=c.admin_get_user(UserPoolId=pool,Username=a.owner_email)
        if user['UserStatus']!='CONFIRMED':raise SystemExit('Owner must be an existing confirmed account')
        c.admin_add_user_to_group(UserPoolId=pool,Username=a.owner_email,GroupName='owner')
    print(json.dumps({'userPoolId':pool,'clientId':client,'businessTable':table,'next':'Deploy backend including business.py, update SPA rewrite for /account; review legacy AWS_IAM admin routes before Cognito-only browser access.'}))
if __name__=='__main__':main()
