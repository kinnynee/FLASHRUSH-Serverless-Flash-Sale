"""Voucher validation and atomic redemption inside the checkout transaction."""
import re
from datetime import datetime, timezone
from botocore.exceptions import ClientError
import business

class VoucherError(ValueError): pass

def canonical(code):
    if not isinstance(code,str) or not re.fullmatch(r'[A-Z0-9_-]{3,32}',code):raise VoucherError('INVALID_VOUCHER')
    return code

def date(value):
    try:
        d=datetime.fromisoformat(value.replace('Z','+00:00'))
        if d.tzinfo is None:raise ValueError()
        return d.timestamp()
    except (ValueError,AttributeError):raise VoucherError('INVALID_VOUCHER_DATES')

def validate(data, old=None):
    fields={'code','type','value','minSpend','maxDiscount','usageLimit','startsAt','endsAt','enabled','version'}
    if not isinstance(data,dict) or set(data)-fields:raise VoucherError('INVALID_VOUCHER')
    code=canonical(data.get('code'))
    if data.get('type') not in ('percent','fixed') or type(data.get('enabled')) is not bool:raise VoucherError('INVALID_VOUCHER')
    for name,low,high in [('value',1,100 if data['type']=='percent' else 100000000),('minSpend',0,1000000000),('maxDiscount',0,100000000),('usageLimit',1,1000000)]:
        if type(data.get(name)) is not int or not low<=data[name]<=high:raise VoucherError('INVALID_VOUCHER')
    if date(data.get('endsAt'))<=date(data.get('startsAt')):raise VoucherError('INVALID_VOUCHER_DATES')
    if old and data['usageLimit']<old.get('usedCount',0):raise VoucherError('VOUCHER_LIMIT_BELOW_USAGE')
    return {k:v for k,v in data.items() if k!='version'}

def quote(code, user, subtotal):
    code=canonical(code)
    value=business.table().get_item(Key={'id':'voucher#'+code},ConsistentRead=True).get('Item')
    now=datetime.now(timezone.utc).timestamp()
    if not value or not value['enabled'] or not date(value['startsAt'])<=now<date(value['endsAt']):raise VoucherError('VOUCHER_UNAVAILABLE')
    if value['usedCount']>=value['usageLimit']:raise VoucherError('VOUCHER_EXHAUSTED')
    if subtotal<value['minSpend']:raise VoucherError('VOUCHER_MIN_SPEND')
    if business.table().get_item(Key={'id':'redeem#'+code+'#'+user},ConsistentRead=True).get('Item'):raise VoucherError('VOUCHER_ALREADY_USED')
    discount=subtotal*int(value['value'])//100 if value['type']=='percent' else int(value['value'])
    if value['maxDiscount']:discount=min(discount,int(value['maxDiscount']))
    discount=min(subtotal,discount)
    return {'code':code,'version':int(value['version']),'subtotal':subtotal,'discount':discount,'total':subtotal-discount}

def redemption(snapshot,user,checkout_id,subtotal,values):
    current=quote(snapshot['code'],user,subtotal)
    if current!=snapshot:raise VoucherError('VOUCHER_CHANGED')
    now=datetime.now(timezone.utc).isoformat()
    return [{'Update':{'TableName':business.table().name,'Key':values({'id':'voucher#'+snapshot['code']}),
        'UpdateExpression':'ADD usedCount :one','ConditionExpression':'#v=:version AND enabled=:yes AND usedCount<usageLimit',
        'ExpressionAttributeNames':{'#v':'version'},'ExpressionAttributeValues':values({':one':1,':version':snapshot['version'],':yes':True})}},
        {'Put':{'TableName':business.table().name,'Item':values({'id':'redeem#'+snapshot['code']+'#'+user,'kind':'redemption','checkoutId':checkout_id,'createdAt':now,'discount':snapshot['discount']}),'ConditionExpression':'attribute_not_exists(id)'}}]

def admin(event,response,error):
    method=event['requestContext']['http']['method'];path=event['rawPath']
    try:
        if method=='GET':
            items=business.records('voucher');return response(200,{'items':sorted(items,key=lambda i:i['code'])})
        data=business.body(event)
        code=canonical(data.get('code'));key='voucher#'+code
        old=business.table().get_item(Key={'id':key},ConsistentRead=True).get('Item')
        if method=='POST' and old:return error(409,'VOUCHER_EXISTS')
        if method=='PATCH' and not old:return error(404,'VOUCHER_NOT_FOUND')
        value=validate(data,old)
        if old:
            if type(data.get('version')) is not int or data['version']!=old['version']:return error(409,'VERSION_CONFLICT')
            args={'ConditionExpression':'#v=:v AND usedCount=:used','ExpressionAttributeNames':{'#v':'version'},'ExpressionAttributeValues':{':v':old['version'],':used':old['usedCount']}}
        else:args={'ConditionExpression':'attribute_not_exists(id)'}
        item={**value,'id':key,'kind':'voucher','version':int(old['version'])+1 if old else 1,'usedCount':int(old['usedCount']) if old else 0}
        business.table().put_item(Item=item,**args)
        return response(200 if old else 201,item)
    except VoucherError as exc:return error(400,str(exc))
    except ClientError as exc:
        if exc.response['Error']['Code']=='ConditionalCheckFailedException':return error(409,'VERSION_CONFLICT')
        raise
