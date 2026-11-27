import os
import unittest
import boto3
from moto import mock_aws
import test_customer
import vouchers

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
