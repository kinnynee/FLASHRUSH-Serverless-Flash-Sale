"""Customer identity, staff permissions and auditable stock adjustments."""
import hashlib
import json
import os
import uuid
import base64
import time
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

ROLES = {'owner', 'manager', 'warehouse', 'support'}
serializer = TypeSerializer()

def stamp(): return datetime.now(timezone.utc).isoformat()
def table(): return boto3.resource('dynamodb').Table(os.environ['BUSINESS_TABLE'])
def pool(): return os.environ['USER_POOL_ID']
def cognito(): return boto3.client('cognito-idp')
def client_id(): return os.environ['USER_POOL_CLIENT_ID']
def body(event):
    import base64
    raw = event.get('body') or '{}'
    if event.get('isBase64Encoded'): raw = base64.b64decode(raw).decode()
    value = json.loads(raw)
    if not isinstance(value, dict): raise ValueError('Invalid body')
    return value

def identity(event):
    headers = {k.lower():v for k,v in event.get('headers', {}).items()}
    auth = headers.get('authorization', '')
    if not auth.startswith('Bearer '): return None
    user = cognito().get_user(AccessToken=auth[7:])
    attrs = {v['Name']:v['Value'] for v in user['UserAttributes']}
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims')
    # Mixed guest/authenticated /orders cannot have an optional Gateway authorizer.
    # GetUser has already validated the token; decode only to bind its issuer/client.
    if claims is None and event.get('rawPath') == '/orders':
        try:
            encoded = auth[7:].split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        except (ValueError, IndexError, UnicodeError):
            claims = {}
    claims = claims or {}
    try:
        valid = (claims.get('sub') == attrs.get('sub') and bool(attrs.get('sub')) and
                 bool(os.environ.get('CUSTOMER_ISSUER')) and claims.get('iss') == os.environ.get('CUSTOMER_ISSUER') and
                 claims.get('client_id') == client_id() and claims.get('token_use') == 'access' and
                 float(claims.get('exp', 0)) > time.time() and
                 'aws.cognito.signin.user.admin' in str(claims.get('scope', '')).split())
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ClientError({'Error': {'Code': 'NotAuthorizedException', 'Message': 'Invalid access token'}}, 'GetUser')
    actual = cognito().admin_get_user(UserPoolId=pool(), Username=user['Username'])
    local_attrs = {v['Name']:v['Value'] for v in actual['UserAttributes']}
    if local_attrs.get('sub') != attrs.get('sub') or not actual.get('Enabled', False):
        raise ClientError({'Error': {'Code': 'NotAuthorizedException', 'Message': 'Invalid account'}}, 'GetUser')
    groups, token = [], None
    while True:
        page = cognito().admin_list_groups_for_user(UserPoolId=pool(), Username=user['Username'], **({'NextToken':token} if token else {}))
        groups += [g['GroupName'] for g in page['Groups']]
        token = page.get('NextToken')
        if not token: break
    return {'id':attrs['sub'], 'username':user['Username'], 'email':attrs.get('email',''), 'name':attrs.get('name',''), 'roles':[g for g in groups if g in ROLES]}

def authorize(user, method, path):
    if not user: return False
    roles = set(user['roles'])
    if 'owner' in roles: return True
    if path.startswith('/admin/users'): return False
    if path.startswith('/admin/inventory'): return bool(roles & {'manager','warehouse'})
    if path.startswith('/admin/customers'): return bool(roles & {'manager','support'})
    if method == 'GET' and path.startswith(('/admin/overview','/admin/orders')): return bool(roles & {'manager','support'})
    return 'manager' in roles

def auth_route(event, response, error):
    path = event['rawPath']; method = event['requestContext']['http']['method']
    if path == '/auth/me' and method == 'GET':
        user = identity(event)
        return response(200,user) if user else error(401,'UNAUTHORIZED')
    if method != 'POST': return error(404,'NOT_FOUND')
    data = body(event); c = cognito()
    email = str(data.get('email','')).strip().lower()
    if path == '/auth/register':
        if not email or len(email)>254 or '@' not in email: return error(400,'INVALID_EMAIL')
        name = str(data.get('name','')).strip()
        if not 1<=len(name)<=120: return error(400,'INVALID_NAME')
        result=c.sign_up(ClientId=client_id(),Username=email,Password=data['password'],UserAttributes=[{'Name':'email','Value':email},{'Name':'name','Value':name}])
        return response(201,{'confirmationRequired':not result['UserConfirmed']})
    if path == '/auth/confirm':
        c.confirm_sign_up(ClientId=client_id(),Username=email,ConfirmationCode=data['code']); return response(200,{'confirmed':True})
    if path == '/auth/login':
        result=c.initiate_auth(ClientId=client_id(),AuthFlow='USER_PASSWORD_AUTH',AuthParameters={'USERNAME':email,'PASSWORD':data['password']})
        if result.get('ChallengeName'): return response(200,{'challenge':result['ChallengeName'],'session':result['Session']})
        return response(200,{'accessToken':result['AuthenticationResult']['AccessToken'],'expiresIn':result['AuthenticationResult']['ExpiresIn']})
    if path == '/auth/new-password':
        result=c.respond_to_auth_challenge(ClientId=client_id(),ChallengeName='NEW_PASSWORD_REQUIRED',Session=data['session'],ChallengeResponses={'USERNAME':email,'NEW_PASSWORD':data['password']})
        return response(200,{'accessToken':result['AuthenticationResult']['AccessToken'],'expiresIn':result['AuthenticationResult']['ExpiresIn']})
    if path == '/auth/forgot-password':
        c.forgot_password(ClientId=client_id(),Username=email); return response(200,{'sent':True})
    if path == '/auth/reset-password':
        c.confirm_forgot_password(ClientId=client_id(),Username=email,ConfirmationCode=data['code'],Password=data['password']); return response(200,{'reset':True})
    if path == '/auth/logout':
        token={k.lower():v for k,v in event.get('headers',{}).items()}.get('authorization','').removeprefix('Bearer ')
        c.global_sign_out(AccessToken=token); return response(200,{'signedOut':True})
    return error(404,'NOT_FOUND')

def records(kind):
    result=[]; kwargs={}
    while True:
        page=table().scan(**kwargs)
        result.extend(i for i in page['Items'] if i.get('kind')==kind)
        if not page.get('LastEvaluatedKey'): return result
        kwargs['ExclusiveStartKey']=page['LastEvaluatedKey']

def inventory_adjust(products, data, actor):
    if set(data)-{'productId','delta','reason','requestId'}: raise ValueError('Invalid fields')
    delta=data.get('delta'); reason=str(data.get('reason','')).strip(); pid=data.get('productId')
    if type(delta) is not int or not delta or abs(delta)>10000 or not 3<=len(reason)<=500 or not isinstance(pid,str) or not pid: raise ValueError('Invalid adjustment')
    request_id=str(uuid.UUID(data['requestId']))
    key='movement#'+request_id; digest=hashlib.sha256(json.dumps({'productId':pid,'delta':delta,'reason':reason},sort_keys=True).encode()).hexdigest()
    old=table().get_item(Key={'id':key},ConsistentRead=True).get('Item')
    if old:
        if old['payloadHash']!=digest: return None,'IDEMPOTENCY_CONFLICT'
        return old,None
    movement={'id':key,'kind':'movement','productId':pid,'delta':delta,'reason':reason,'actorId':actor['id'],'createdAt':stamp(),'payloadHash':digest}
    av=lambda d:{k:serializer.serialize(v) for k,v in d.items()}
    condition='attribute_exists(productId)'+(' AND stock >= :minimum' if delta<0 else '')
    values={':delta':delta, **({':minimum':abs(delta)} if delta<0 else {})}
    try:
        boto3.client('dynamodb').transact_write_items(TransactItems=[{'Update':{'TableName':products.name,'Key':av({'productId':pid}),'UpdateExpression':'ADD stock :delta','ConditionExpression':condition,'ExpressionAttributeValues':av(values)}},{'Put':{'TableName':table().name,'Item':av(movement),'ConditionExpression':'attribute_not_exists(id)'}}])
    except ClientError as exc:
        if exc.response['Error']['Code']!='TransactionCanceledException': raise
        old=table().get_item(Key={'id':key},ConsistentRead=True).get('Item')
        if old: return (old,None) if old['payloadHash']==digest else (None,'IDEMPOTENCY_CONFLICT')
        return None,'STOCK_CONFLICT'
    return movement,None

def route(event, user, products, response, error):
    path=event['rawPath']; method=event['requestContext']['http']['method']; query=event.get('queryStringParameters') or {}
    if path.startswith('/admin/inventory'):
        if method=='GET':
            if path.endswith('/movements'):
                items=records('movement')
                if query.get('productId'): items=[i for i in items if i['productId']==query['productId']]
                items=sorted(items,key=lambda i:i['createdAt'],reverse=True)
                for i in items: i.pop('payloadHash',None)
                return response(200,{'items':items[:200]})
            page, kwargs=[],{}
            while True:
                p=products.scan(**kwargs);page+=p['Items']
                if not p.get('LastEvaluatedKey'): break
                kwargs['ExclusiveStartKey']=p['LastEvaluatedKey']
            return response(200,{'items':[{k:i.get(k) for k in ('productId','name','stock','initialStock')} for i in page]})
        if method=='POST' and path.endswith('/adjustments'):
            value,problem=inventory_adjust(products,body(event),user)
            if problem:return error(409,problem)
            value.pop('payloadHash',None);return response(200,value)
    if path.startswith('/admin/customers'):
        if method=='PATCH':
            data=body(event)
            if set(data)-{'username','name'} or not 1<=len(str(data.get('name','')).strip())<=120:raise ValueError('Invalid profile')
            groups=cognito().admin_list_groups_for_user(UserPoolId=pool(),Username=data['username'])['Groups']
            if any(g['GroupName'] in ROLES for g in groups):return error(403,'STAFF_PROFILE_PROTECTED')
            cognito().admin_update_user_attributes(UserPoolId=pool(),Username=data['username'],UserAttributes=[{'Name':'name','Value':data['name'].strip()}])
            return response(200,{'updated':True})
        if method=='GET':
            users=cognito().list_users(UserPoolId=pool(),Limit=60,**({'PaginationToken':query['cursor']} if query.get('cursor') else {}))
            values=[]
            for u in users['Users']:
                groups=cognito().admin_list_groups_for_user(UserPoolId=pool(),Username=u['Username'])['Groups']
                if any(g['GroupName'] in ROLES for g in groups): continue
                attrs={x['Name']:x['Value'] for x in u['Attributes']};values.append({'id':attrs['sub'],'username':u['Username'],'email':attrs.get('email',''),'name':attrs.get('name',''),'enabled':u['Enabled'],'status':u['UserStatus']})
            return response(200,{'items':values,'nextCursor':users.get('PaginationToken')})
    if path.startswith('/admin/users'):
        c=cognito()
        if method=='GET':
            result=c.list_users(UserPoolId=pool(),Limit=60,**({'PaginationToken':query['cursor']} if query.get('cursor') else {}));values=[]
            for u in result['Users']:
                attrs={x['Name']:x['Value'] for x in u['Attributes']}
                groups=c.admin_list_groups_for_user(UserPoolId=pool(),Username=u['Username'])['Groups']
                values.append({'id':attrs['sub'],'username':u['Username'],'email':attrs.get('email',''),'name':attrs.get('name',''),'enabled':u['Enabled'],'roles':[g['GroupName'] for g in groups if g['GroupName'] in ROLES]})
            return response(200,{'items':values,'nextCursor':result.get('PaginationToken')})
        data=body(event)
        if method=='POST':
            role=data['role'];email=str(data['email']).strip().lower()
            if role not in ROLES-{'owner'}:return error(400,'INVALID_ROLE')
            c.admin_create_user(UserPoolId=pool(),Username=email,DesiredDeliveryMediums=['EMAIL'],UserAttributes=[{'Name':'email','Value':email},{'Name':'email_verified','Value':'true'},{'Name':'name','Value':str(data['name'])[:120]}])
            c.admin_add_user_to_group(UserPoolId=pool(),Username=email,GroupName=role)
            return response(201,{'invited':True})
        if method=='PATCH':
            if set(data)-{'username','enabled','role'} or not ({'enabled','role'} & set(data)):raise ValueError('Invalid user update')
            if 'role' in data and data['role'] not in ((ROLES-{'owner'}) | {'customer'}):return error(400,'INVALID_ROLE')
            if 'enabled' in data and type(data['enabled']) is not bool:raise ValueError('Invalid enabled')
            username=data['username']
            if username==user['username']:return error(409,'CANNOT_CHANGE_SELF')
            groups=c.admin_list_groups_for_user(UserPoolId=pool(),Username=username)['Groups']
            if any(g['GroupName']=='owner' for g in groups):return error(409,'OWNER_PROTECTED')
            if 'enabled' in data:
                if type(data['enabled']) is not bool:raise ValueError('Invalid enabled')
                action=c.admin_enable_user if data['enabled'] else c.admin_disable_user
                action(UserPoolId=pool(),Username=username)
            if 'role' in data:
                role=data['role']
                if role not in ((ROLES-{'owner'}) | {'customer'}):return error(400,'INVALID_ROLE')
                for g in groups:
                    if g['GroupName'] in ROLES:c.admin_remove_user_from_group(UserPoolId=pool(),Username=username,GroupName=g['GroupName'])
                if role!='customer':c.admin_add_user_to_group(UserPoolId=pool(),Username=username,GroupName=role)
            return response(200,{'updated':True})
    return error(404,'NOT_FOUND')
