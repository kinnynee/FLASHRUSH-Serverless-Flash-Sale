import json
import os
import time
import unittest
import uuid
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from moto import mock_aws
import test_customer
import business


class StaffIdentityTests(unittest.TestCase):
    def event(self, **changes):
        claims = {'sub': 'alice', 'iss': 'https://issuer.test', 'client_id': 'client',
                  'token_use': 'access', 'exp': int(time.time()) + 600,
                  'scope': 'aws.cognito.signin.user.admin'}
        claims.update(changes)
        return {'rawPath': '/admin/orders', 'headers': {'Authorization': 'Bearer access'},
                'requestContext': {'authorizer': {'jwt': {'claims': claims}}}}

    def client(self):
        client = Mock()
        attrs = [{'Name': 'sub', 'Value': 'alice'}]
        client.get_user.return_value = {'Username': 'alice', 'UserAttributes': attrs}
        client.admin_get_user.return_value = {'Enabled': True, 'UserAttributes': attrs}
        client.admin_list_groups_for_user.return_value = {'Groups': [{'GroupName': 'warehouse'}]}
        return client

    def test_wrong_client_issuer_type_expiry_and_subject_are_rejected(self):
        with patch.dict(os.environ, USER_POOL_ID='pool', USER_POOL_CLIENT_ID='client', CUSTOMER_ISSUER='https://issuer.test'), \
                patch.object(business, 'cognito', return_value=self.client()):
            for changes in ({'client_id':'other'}, {'iss':'https://wrong.test'}, {'token_use':'id'},
                            {'exp':int(time.time())-1}, {'sub':'bob'}, {'scope':'openid'}):
                with self.subTest(changes=changes), self.assertRaises(ClientError):
                    business.identity(self.event(**changes))

    def test_live_roles_are_used_and_disabled_user_is_rejected(self):
        client = self.client()
        with patch.dict(os.environ, USER_POOL_ID='pool', USER_POOL_CLIENT_ID='client', CUSTOMER_ISSUER='https://issuer.test'), \
                patch.object(business, 'cognito', return_value=client):
            self.assertEqual(business.identity(self.event())['roles'], ['warehouse'])
            client.admin_get_user.return_value['Enabled'] = False
            with self.assertRaises(ClientError): business.identity(self.event())

    def test_revoked_token_and_missing_gateway_claims_fail(self):
        client = self.client()
        with patch.dict(os.environ, USER_POOL_ID='pool', USER_POOL_CLIENT_ID='client', CUSTOMER_ISSUER='https://issuer.test'), patch.object(business,'cognito',return_value=client):
            event = self.event(); event.pop('requestContext')
            with self.assertRaises(ClientError): business.identity(event)
            client.get_user.side_effect = ClientError({'Error':{'Code':'NotAuthorizedException'}},'GetUser')
            with self.assertRaises(ClientError): business.identity(self.event())

    def test_all_voucher_methods_and_role_matrix(self):
        for role in ('owner','manager','warehouse','support','customer'):
            for method in ('GET','POST','PATCH'):
                self.assertEqual(business.authorize({'roles':[role]},method,'/admin/vouchers'),role in ('owner','manager'))
            self.assertEqual(business.authorize({'roles':[role]},'POST','/admin/inventory'),role in ('owner','manager','warehouse'))
            self.assertEqual(business.authorize({'roles':[role]},'GET','/admin/orders'),role in ('owner','manager','support'))
            self.assertEqual(business.authorize({'roles':[role]},'PATCH','/admin/users'),role == 'owner')


@mock_aws
class OrderIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_customer.CustomerTests()
        self.fixture.setUp()
        self.app = self.fixture.app

    def submit(self, user=None, token=None):
        event = {'rawPath':'/orders','requestContext':{'http':{'method':'POST'}},
                 'headers':{'Idempotency-Key':token or str(uuid.uuid4()), **({'Authorization':'Bearer access'} if user else {})},
                 'body':json.dumps({'productId':'one','quantity':1})}
        with patch.object(business,'identity',return_value={'id':user,'roles':[]} if user else None):
            result=self.app.api(event,None)
        return result['statusCode'], json.loads(result['body'])

    def test_authenticated_legacy_order_is_indexed_and_remains_worker_compatible(self):
        token = str(uuid.uuid4())
        status, result = self.submit('alice', token)
        self.assertEqual(status,202)
        self.app.process({'schemaVersion':'1.0','orderId':result['orderId'],'productId':'one','quantity':1})
        self.assertEqual(self.fixture.request('GET','/me/orders')[1]['items'][0]['orderId'],result['orderId'])
        self.assertEqual(self.fixture.request('GET','/me/orders/'+result['orderId'])[0],200)
        self.assertEqual(self.fixture.request('GET','/me/orders/'+result['orderId'],user='bob')[0],404)
        self.assertEqual(self.submit('alice',token)[1]['orderId'],result['orderId'])
        self.assertEqual(self.submit('bob',token)[0],409)
        self.assertEqual(self.app.products.get_item(Key={'productId':'one'})['Item']['stock'],2)

    def test_guest_snapshot_survives_product_deletion_and_omits_private_fields(self):
        _, result = self.submit()
        order = self.app.read_order(result['orderId'])
        self.app.products.delete_item(Key={'productId':'one'})
        shown = self.app.public_order({**order,'address':{'street':'private'},'idempotencyKeyHash':'secret'})
        self.assertEqual(shown['item']['unitPrice'],100)
        self.assertEqual(shown['item']['name'],'one')
        self.assertEqual(shown['totalAmount'],100)
        self.assertNotIn('address',shown)
        self.assertNotIn('idempotencyKeyHash',shown)

    def test_browser_admin_key_alone_cannot_authorize(self):
        event={'rawPath':'/admin/overview','requestContext':{'http':{'method':'GET'}},'headers':{'X-Admin-Key':'test-key'}}
        with patch.object(self.app,'ADMIN_API_KEY','test-key'):
            self.assertEqual(self.app.api(event,None)['statusCode'],401)

    def test_legacy_history_is_paginated_newest_first_without_cross_owner_results(self):
        import customer
        for index in range(27):
            item = {'orderId':f'legacy-{index:02}','customerId':'alice','productId':'one','quantity':1,
                'createdAt':f'2026-01-{index+1:02}T00:00:00+00:00','updatedAt':'2026-02-01T00:00:00+00:00','status':'CONFIRMED'}
            self.app.orders.put_item(Item=item)
            self.app.ddb.transact_write_items(TransactItems=[customer.index_write(item)])
        first = customer.order_list('alice',{})
        second = customer.order_list('alice',{'cursor':first['nextCursor']})
        self.assertEqual(len(first['items']),25)
        self.assertEqual(len(second['items']),2)
        self.assertEqual(first['items'][0]['orderId'],'legacy-26')
        self.assertEqual(second['items'][-1]['orderId'],'legacy-00')
        self.assertEqual(customer.order_list('bob',{'cursor':first['nextCursor']})['items'],[])
        self.assertIsNone(first['items'][0]['item']['unitPrice'])
        self.assertEqual(self.app.admin_overview_payload()['unknownRevenueOrders'],27)
