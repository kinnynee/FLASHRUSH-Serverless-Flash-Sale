import os
import unittest
import boto3
from moto import mock_aws
import test_customer
import vouchers
from unittest.mock import patch
from botocore.exceptions import ClientError

@mock_aws
class VoucherTests(unittest.TestCase):
    def setUp(self):
        self.fixture=test_customer.CustomerTests(); self.fixture.setUp()
        os.environ['BUSINESS_TABLE']='business'
        self.table=boto3.resource('dynamodb').create_table(TableName='business',BillingMode='PAY_PER_REQUEST',KeySchema=[{'AttributeName':'id','KeyType':'HASH'}],AttributeDefinitions=[{'AttributeName':'id','AttributeType':'S'}])
        self.value={'id':'voucher#SALE10','kind':'voucher','code':'SALE10','type':'percent','value':10,'minSpend':100,'maxDiscount':15,'usageLimit':1,'usedCount':0,'version':1,'enabled':True,'startsAt':self.fixture.start,'endsAt':self.fixture.end}
        self.table.put_item(Item=self.value)
    def test_quote_rules(self):
        self.assertEqual(vouchers.quote('SALE10','alice',200)['discount'],15)
        with self.assertRaisesRegex(vouchers.VoucherError,'MIN_SPEND'):vouchers.quote('SALE10','alice',50)
        self.table.update_item(Key={'id':'voucher#SALE10'},UpdateExpression='SET enabled=:v',ExpressionAttributeValues={':v':False})
        with self.assertRaisesRegex(vouchers.VoucherError,'UNAVAILABLE'):vouchers.quote('SALE10','alice',200)
    def test_success_retry_and_global_limit(self):
        f=self.fixture;body=f.prepare();body['voucherCode']='SALE10';body['expectedTotal']=185
        code,result,token=f.checkout(body);self.assertEqual(code,202)
        self.assertEqual(result['totalAmount'],185)
        f.process(result);f.process(result)
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],1)
        self.assertEqual(f.app.products.get_item(Key={'productId':'one'})['Item']['stock'],2)
        self.assertEqual(f.checkout(body,token=token)[1]['checkoutId'],result['checkoutId'])
        with self.assertRaisesRegex(vouchers.VoucherError,'EXHAUSTED'):vouchers.quote('SALE10','bob',200)
    def test_changed_voucher_never_consumes_stock(self):
        f=self.fixture;body=f.prepare();body['voucherCode']='SALE10';body['expectedTotal']=185
        _,result,_=f.checkout(body)
        self.table.update_item(Key={'id':'voucher#SALE10'},UpdateExpression='SET version=:v',ExpressionAttributeValues={':v':2})
        f.process(result)
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],0)
        self.assertEqual(f.app.products.get_item(Key={'productId':'one'})['Item']['stock'],3)
        self.assertEqual(f.app.read_order(result['orders'][0]['orderId'])['status'],'FAILED')
    def test_stock_failure_does_not_consume(self):
        f=self.fixture;body=f.prepare();body['voucherCode']='SALE10';body['expectedTotal']=185
        _,result,_=f.checkout(body)
        f.app.products.update_item(Key={'productId':'two'},UpdateExpression='SET stock=:v',ExpressionAttributeValues={':v':0})
        f.process(result)
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],0)
        self.assertEqual(f.app.products.get_item(Key={'productId':'one'})['Item']['stock'],3)

# Keep imported fixture tests out of discovery.



    def test_competing_checkouts_last_use_is_atomic(self):
        f=self.fixture
        a=f.prepare();a['voucherCode']='SALE10';a['expectedTotal']=185
        _,first,_=f.checkout(a)
        b=f.prepare('bob');b['voucherCode']='SALE10';b['expectedTotal']=185
        _,second,_=f.checkout(b,user='bob')
        f.process(first);f.process(second,user='bob')
        self.assertEqual(f.app.read_order(second['orders'][0]['orderId'])['status'],'FAILED')
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],1)
        self.assertEqual(f.app.products.get_item(Key={'productId':'one'})['Item']['stock'],2)
    def test_one_use_per_customer_and_fixed_cap(self):
        self.value.update(type='fixed',value=500,maxDiscount=0,usageLimit=10)
        self.table.put_item(Item=self.value)
        self.assertEqual(vouchers.quote('SALE10','alice',200)['total'],0)
        self.table.put_item(Item={'id':'redeem#SALE10#alice','kind':'redemption'})
        with self.assertRaisesRegex(vouchers.VoucherError,'ALREADY_USED'):vouchers.quote('SALE10','alice',200)
    def test_missing_dates_are_validation_errors(self):
        with self.assertRaises(vouchers.VoucherError):vouchers.validate({'code':'SALE10','type':'percent','enabled':True,'value':10,'minSpend':0,'maxDiscount':0,'usageLimit':1})

    def test_new_checkout_review_quotes_managed_voucher(self):
        f=self.fixture;body=f.prepare()
        code,pricing=f.request('POST','/me/checkout-quote',{'version':body['version'],'lineIds':body['lineIds'],'voucherCode':'SALE10','shippingMethod':'STANDARD','paymentMethod':'COD'})
        self.assertEqual(code,200)
        self.assertEqual(pricing['total'],185)
        body.update(voucherCode='SALE10',expectedTotal=pricing['total'],shippingMethod='STANDARD',paymentMethod='COD')
        code,result,_=f.checkout(body)
        self.assertEqual(code,202)
        f.process(result)
        self.assertEqual(f.app.read_order(result['orders'][0]['orderId'])['status'],'CONFIRMED')
        self.assertEqual(result['pricing']['discount'],15)

    def test_retired_code_cannot_be_quoted_saved_created_or_listed(self):
        self.table.put_item(Item={**self.value, 'id':'voucher#HAUMON', 'code':'HAUMON'})
        f = self.fixture
        body = f.prepare()
        for path, payload in [('/me/checkout-quote', {**body, 'voucherCode':'HAUMON'}),
                              ('/me/vouchers/save', {'code':' haumon '})]:
            payload.pop('addressId', None)
            status, result = f.request('POST', path, payload)
            self.assertEqual(status, 409)
            self.assertEqual(result['error']['code'], 'VOUCHER_RETIRED')
        self.assertNotIn('HAUMON', [item['code'] for item in vouchers.catalog('alice')['items']])
        with self.assertRaisesRegex(vouchers.VoucherError, 'RETIRED'):
            vouchers.validate({**vouchers.presets()[0], 'code':'HAUMON'})

    def test_catalog_quotes_owned_selection_and_recommends_largest_discount(self):
        f = self.fixture
        self.table.put_item(Item={**self.value, 'id':'voucher#FIXED30', 'code':'FIXED30',
                                 'type':'fixed', 'value':30, 'maxDiscount':0})
        body = f.prepare()
        selection = {k:body[k] for k in ('version','lineIds')}
        status, result = f.request('POST', '/me/vouchers', selection)
        self.assertEqual(status, 200)
        self.assertEqual((result['bestCode'], result['subtotal']), ('FIXED30', 200))
        self.assertEqual(result['items'][0]['discount'], 30)
        self.assertEqual(f.request('POST', '/me/vouchers', selection, user='bob')[0], 409)
        self.assertEqual(f.request('POST', '/me/vouchers', {**selection, 'subtotal':999999})[0], 400)
        self.assertEqual(f.request('POST', '/me/vouchers', {**selection, 'version':0})[0], 409)
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'], 0)

    def test_catalog_explains_minimum_stock_future_and_exhaustion(self):
        f = self.fixture
        self.value['minSpend'] = 500
        self.table.put_item(Item=self.value)
        body = f.prepare()
        selection = {k:body[k] for k in ('version','lineIds')}
        result = f.request('POST','/me/vouchers',selection)[1]
        self.assertEqual((result['items'][0]['reason'], result['items'][0]['missingSpend']), ('VOUCHER_MIN_SPEND',300))
        self.assertIsNone(result['bestCode'])
        f.app.products.update_item(Key={'productId':'one'},UpdateExpression='SET stock=:v',ExpressionAttributeValues={':v':0})
        self.assertEqual(f.request('POST','/me/vouchers',selection)[1]['items'][0]['reason'],'SALE_SOLD_OUT')
        self.value.update(startsAt=f.end, endsAt='2099-01-01T00:00:00+00:00')
        self.table.put_item(Item=self.value)
        self.assertEqual(vouchers.catalog('alice',1000)['items'][0]['reason'],'VOUCHER_NOT_STARTED')
        self.value.update(startsAt=f.start, usedCount=1)
        self.table.put_item(Item=self.value)
        self.assertEqual(vouchers.catalog('alice',1000)['items'][0]['reason'],'VOUCHER_EXHAUSTED')

    def test_save_is_private_idempotent_and_does_not_reserve_usage(self):
        f = self.fixture
        for _ in range(2):
            self.assertEqual(f.request('POST','/me/vouchers/save',{'code':' sale10 '})[0],200)
        self.assertTrue(f.request('GET','/me/vouchers')[1]['items'][0]['saved'])
        self.assertFalse(f.request('GET','/me/vouchers',user='bob')[1]['items'][0]['saved'])
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],0)
        self.assertEqual(len([i for i in self.table.scan()['Items'] if i.get('kind')=='savedVoucher']),1)
        self.assertEqual(f.request('POST','/me/vouchers/save',{'code':'SALE10','userId':'bob'})[0],400)

    def test_expired_and_disabled_codes_disappear_and_saved_code_can_be_revoked(self):
        vouchers.save('SALE10','alice')
        self.value['enabled'] = False
        self.table.put_item(Item=self.value)
        self.assertEqual(vouchers.catalog('alice',200)['items'],[])
        with self.assertRaisesRegex(vouchers.VoucherError,'UNAVAILABLE'): vouchers.quote('SALE10','alice',200)
        self.value.update(enabled=True, startsAt='2020-01-01T00:00:00Z', endsAt='2020-02-01T00:00:00Z')
        self.table.put_item(Item=self.value)
        self.assertEqual(vouchers.catalog('alice',200)['items'],[])
        with self.assertRaisesRegex(vouchers.VoucherError,'EXPIRED'): vouchers.quote('SALE10','alice',200)

    def test_transaction_race_for_last_redemption_retries_without_overspend(self):
        f = self.fixture
        body = f.prepare(); body.update(voucherCode='SALE10',expectedTotal=185)
        _, first, _ = f.checkout(body)
        other = f.prepare('bob'); other.update(voucherCode='SALE10',expectedTotal=185)
        _, second, _ = f.checkout(other, user='bob')
        original = f.app.ddb.transact_write_items
        raced = False
        def interleave(**kwargs):
            nonlocal raced
            if not raced:
                raced = True
                f.process(second, user='bob')
            return original(**kwargs)
        with patch.object(f.app.ddb,'transact_write_items',side_effect=interleave):
            with self.assertRaises(ClientError): f.process(first)
        f.process(first)
        self.assertEqual(f.app.read_order(first['orders'][0]['orderId'])['status'],'FAILED')
        self.assertEqual(f.app.read_order(second['orders'][0]['orderId'])['status'],'CONFIRMED')
        self.assertEqual(self.table.get_item(Key={'id':'voucher#SALE10'})['Item']['usedCount'],1)
        self.assertEqual(f.app.products.get_item(Key={'productId':'one'})['Item']['stock'],2)

    def test_presets_are_valid_distinct_and_do_not_publish_on_read(self):
        presets = vouchers.presets()
        self.assertEqual(len({p['code'] for p in presets}),5)
        self.assertEqual({p['type'] for p in presets},{'percent','fixed'})
        for preset in presets: vouchers.validate(preset)
        self.assertEqual(self.table.scan()['Count'],1)
