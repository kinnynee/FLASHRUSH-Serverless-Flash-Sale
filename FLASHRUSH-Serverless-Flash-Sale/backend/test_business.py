import os,unittest,uuid,time
from unittest.mock import Mock,patch
import boto3
from moto import mock_aws
import business

class Permissions(unittest.TestCase):
 def test_role_matrix(self):
  for role,path,allowed in [('customer','/admin/users',False),('warehouse','/admin/inventory',True),('warehouse','/admin/customers',False),('support','/admin/customers',True),('manager','/admin/users',False),('owner','/admin/users',True)]:
   self.assertEqual(business.authorize({'roles':[role]},'GET',path),allowed)
 def test_identity_uses_cognito(self):
  c=Mock();c.get_user.return_value={'Username':'real','UserAttributes':[{'Name':'sub','Value':'real-id'}]};c.admin_list_groups_for_user.return_value={'Groups':[{'GroupName':'warehouse'}]};c.admin_get_user.return_value={'Enabled':True,'UserAttributes':[{'Name':'sub','Value':'real-id'}]}
  claims={'sub':'real-id','iss':'https://issuer.test','client_id':'client','token_use':'access','exp':time.time()+600,'scope':'aws.cognito.signin.user.admin'}
  with patch.dict(os.environ,USER_POOL_ID='pool',USER_POOL_CLIENT_ID='client',CUSTOMER_ISSUER='https://issuer.test'),patch.object(business,'cognito',return_value=c):
   self.assertEqual(business.identity({'headers':{'Authorization':'Bearer test'},'requestContext':{'authorizer':{'jwt':{'claims':claims}}}})['id'],'real-id')
  c.get_user.assert_called_once_with(AccessToken='test')

 def test_signup_does_not_grant_staff_groups(self):
  c=Mock();c.sign_up.return_value={'UserConfirmed':False}
  import json
  event={'rawPath':'/auth/register','requestContext':{'http':{'method':'POST'}},'body':json.dumps({'email':'buyer@example.test','password':'not-used-in-test','name':'Buyer','role':'owner'})}
  with patch.dict(os.environ,USER_POOL_CLIENT_ID='client'),patch.object(business,'cognito',return_value=c):
   self.assertEqual(business.auth_route(event,lambda a,b:(a,b),lambda a,b:(a,b))[0],201)
  c.admin_add_user_to_group.assert_not_called()
 def test_owner_and_self_protected(self):
  import json
  c=Mock();c.admin_list_groups_for_user.return_value={'Groups':[{'GroupName':'owner'}]}
  event={'rawPath':'/admin/users','requestContext':{'http':{'method':'PATCH'}},'body':json.dumps({'username':'owner','enabled':False})}
  with patch.dict(os.environ,USER_POOL_ID='pool'),patch.object(business,'cognito',return_value=c):
   self.assertEqual(business.route(event,{'username':'other'},None,lambda a,b:(a,b),lambda a,b:(a,b)),(409,'OWNER_PROTECTED'))
  c.admin_disable_user.assert_not_called()

@mock_aws
class Inventory(unittest.TestCase):
 def setUp(self):
  os.environ.update(AWS_DEFAULT_REGION='us-east-1',BUSINESS_TABLE='business')
  db=boto3.resource('dynamodb',region_name='us-east-1')
  for name,key in [('business','id'),('products','productId')]:db.create_table(TableName=name,KeySchema=[{'AttributeName':key,'KeyType':'HASH'}],AttributeDefinitions=[{'AttributeName':key,'AttributeType':'S'}],BillingMode='PAY_PER_REQUEST')
  self.products=db.Table('products');self.products.put_item(Item={'productId':'sku','stock':5})
  self.data={'productId':'sku','delta':-3,'reason':'Damaged stock','requestId':str(uuid.uuid4())}
 def test_atomic_and_idempotent(self):
  actor={'id':'operator'};first,error=business.inventory_adjust(self.products,self.data,actor);self.assertIsNone(error)
  second,error=business.inventory_adjust(self.products,self.data,actor);self.assertEqual(first,second)
  _,error=business.inventory_adjust(self.products,{**self.data,'delta':1},actor);self.assertEqual(error,'IDEMPOTENCY_CONFLICT')
  _,error=business.inventory_adjust(self.products,{**self.data,'requestId':str(uuid.uuid4())},actor);self.assertEqual(error,'STOCK_CONFLICT')
  self.assertEqual(self.products.get_item(Key={'productId':'sku'})['Item']['stock'],2);self.assertEqual(business.table().scan()['Count'],1)
 def test_bad_quantities(self):
  for delta in [True,0,1.5,10001,'3']:
   with self.assertRaises(ValueError):business.inventory_adjust(self.products,{**self.data,'delta':delta},{'id':'u'})
