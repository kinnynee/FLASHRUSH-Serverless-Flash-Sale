"""Voucher validation and atomic redemption inside the checkout transaction."""
import re
from datetime import datetime, timedelta, timezone
from botocore.exceptions import ClientError
import business

class VoucherError(ValueError): pass

def canonical(code):
    if isinstance(code, str): code = code.strip().upper()
    if not isinstance(code,str) or not re.fullmatch(r'[A-Z0-9_-]{3,32}',code):raise VoucherError('INVALID_VOUCHER')
    if code == 'HAUMON': raise VoucherError('VOUCHER_RETIRED')
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
    return {**{k:v for k,v in data.items() if k!='version'}, 'code': code}


def presets():
    now = datetime.now(timezone.utc)
    offers = [('FLASH10', 'percent', 10, 300000, 100000, 500),
              ('SAVE50K', 'fixed', 50000, 500000, 0, 300),
              ('TECH15', 'percent', 15, 2000000, 300000, 200),
              ('MEGA500', 'fixed', 500000, 5000000, 0, 100),
              ('WEEKEND8', 'percent', 8, 1000000, 200000, 300)]
    return [dict(code=code, type=kind, value=value, minSpend=minimum,
                 maxDiscount=cap, usageLimit=limit, enabled=True,
                 startsAt=now.isoformat(), endsAt=(now + timedelta(days=30)).isoformat())
            for code, kind, value, minimum, cap, limit in offers]


def discount_for(value, subtotal):
    discount = subtotal * int(value['value']) // 100 if value['type'] == 'percent' else int(value['value'])
    if value['maxDiscount']: discount = min(discount, int(value['maxDiscount']))
    return int(min(subtotal, discount))


def availability(value, user, subtotal, current=None):
    current = current or datetime.now(timezone.utc).timestamp()
    if value['code'] == 'HAUMON': return 'VOUCHER_RETIRED'
    if not value['enabled']: return 'VOUCHER_UNAVAILABLE'
    if current < date(value['startsAt']): return 'VOUCHER_NOT_STARTED'
    if current >= date(value['endsAt']): return 'VOUCHER_EXPIRED'
    if business.table().get_item(Key={'id':'redeem#'+value['code']+'#'+user},ConsistentRead=True).get('Item'):
        return 'VOUCHER_ALREADY_USED'
    if value['usedCount'] >= value['usageLimit']: return 'VOUCHER_EXHAUSTED'
    if subtotal is None: return 'VOUCHER_SELECT_PRODUCTS'
    if subtotal < value['minSpend']: return 'VOUCHER_MIN_SPEND'
    if discount_for(value, subtotal) <= 0: return 'VOUCHER_NO_DISCOUNT'
    return None


def catalog(user, subtotal=None, selection_issue=None):
    current = datetime.now(timezone.utc).timestamp()
    items = []
    for value in business.records('voucher'):
        if value['code'] == 'HAUMON' or not value['enabled'] or date(value['endsAt']) <= current:
            continue
        reason = availability(value, user, subtotal, current)
        reason = selection_issue or reason
        saved = bool(business.table().get_item(
            Key={'id': 'saved#' + user + '#' + value['code']}, ConsistentRead=True).get('Item'))
        fields = ('code', 'type', 'value', 'minSpend', 'maxDiscount', 'startsAt', 'endsAt')
        items.append({**{k: value[k] for k in fields}, 'saved': saved, 'eligible': reason is None,
                      'reason': reason, 'remaining': max(0, int(value['usageLimit'] - value['usedCount'])),
                      'discount': discount_for(value, subtotal) if reason is None else 0,
                      'missingSpend': max(0, int(value['minSpend'] - (subtotal or 0))),
                      'perCustomerLimit': 1})
    items.sort(key=lambda v: (not v['eligible'], -v['discount'], v['endsAt'], v['code']))
    best = next((v['code'] for v in items if v['eligible']), None)
    return {'items': items, 'bestCode': best, 'subtotal': subtotal, 'maxVouchersPerCheckout': 1}


def save(code, user):
    code = canonical(code)
    value = business.table().get_item(Key={'id': 'voucher#' + code}, ConsistentRead=True).get('Item')
    if not value: raise VoucherError('VOUCHER_UNAVAILABLE')
    reason = availability(value, user, None)
    if reason not in ('VOUCHER_SELECT_PRODUCTS', 'VOUCHER_NOT_STARTED'):
        raise VoucherError(reason)
    # Saving is a bookmark; only the checkout transaction consumes a redemption.
    business.table().put_item(Item={'id': 'saved#' + user + '#' + code, 'kind': 'savedVoucher',
                                   'code': code, 'savedAt': datetime.now(timezone.utc).isoformat()})
    return {'code': code, 'saved': True}

def quote(code, user, subtotal):
    code=canonical(code)
    value=business.table().get_item(Key={'id':'voucher#'+code},ConsistentRead=True).get('Item')
    if not value: raise VoucherError('VOUCHER_UNAVAILABLE')
    reason = availability(value, user, subtotal)
    if reason: raise VoucherError(reason)
    discount = discount_for(value, subtotal)
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
            items=[i for i in business.records('voucher') if i['code'] != 'HAUMON']
            return response(200,{'items':sorted(items,key=lambda i:i['code']), 'presets': presets()})
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
