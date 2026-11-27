import json
import os
import sys
import tempfile
import unittest
import io
import base64
import hashlib
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ci'))
import release_check
import deploy_manual


class ReleaseTests(unittest.TestCase):
    def config(self):
        return {'target':'manual','region':'us-east-1','resources':{'ApiUrl':'https://api.test',
            'WebsiteUrl':'https://site.test','UserPoolClientId':'client'}}

    def test_artifact_binding_rejects_changed_assets_and_wrong_target(self):
        config = self.config()
        with tempfile.TemporaryDirectory() as name, patch.dict(os.environ, release_check.frontend_env(config)):
            directory = Path(name); (directory/'index.html').write_text('<html/>')
            release_check.bind(config, directory)
            release_check.verify(config, directory)
            with self.assertRaisesRegex(ValueError,'different target'):
                release_check.verify({**config,'target':'lab'}, directory)
            (directory/'index.html').write_text('changed')
            with self.assertRaisesRegex(ValueError,'integrity'):
                release_check.verify(config, directory)

    def test_build_missing_cognito_environment_cannot_bind(self):
        with tempfile.TemporaryDirectory() as name, patch.dict(os.environ,{},clear=True):
            with self.assertRaisesRegex(ValueError,'build environment'):
                release_check.bind(self.config(),Path(name))

    def test_homepage_success_cannot_imply_authenticated_smoke(self):
        def respond(url,*args):
            if url.startswith('https://api.test/admin/'): return 401,'application/json',b'{}'
            if url.endswith('/products'): return 200,'application/json',b'{"items":[]}'
            return 200,'text/html',b'<div id="root"></div>'
        with patch.dict(os.environ,{},clear=True), patch.object(release_check,'request',side_effect=respond):
            report = release_check.smoke(Mock(),self.config())
        self.assertEqual(report['public']['status'],'PASS')
        self.assertEqual(report['customer']['status'],'NOT_VERIFIED')
        self.assertEqual(report['staff']['status'],'NOT_VERIFIED')

    def test_failed_smoke_restores_every_overwritten_asset_and_both_lambdas(self):
        config = self.config()
        config.update(nonProduction=True)
        config['resources'].update(ApiFunction='api',WorkerFunction='worker',WebsiteBucket='bucket',DistributionId='dist')
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); dist = root/'frontend/dist'; dist.mkdir(parents=True)
            (dist/'index.html').write_bytes(b'new-index'); (dist/'icon.svg').write_bytes(b'new-icon'); (dist/'new.js').write_bytes(b'new-file')
            (root/'backend').mkdir()
            for module in ('app.py','monitoring.py','business.py','customer.py','vouchers.py'):
                (root/'backend'/module).write_text('# fixture')
            original = {'index.html':b'old-index','icon.svg':b'old-icon'}
            stored = original.copy()
            class Missing(Exception): pass
            s3, lam, cf = Mock(), Mock(), Mock()
            s3.exceptions.NoSuchKey = Missing
            def get_object(Bucket,Key):
                if Key not in stored: raise Missing()
                return {'Body':io.BytesIO(stored[Key]),'ContentType':'text/plain','CacheControl':'no-cache'}
            s3.get_object.side_effect = get_object
            s3.put_object.side_effect = lambda Bucket,Key,Body,**kw: stored.__setitem__(Key,Body)
            s3.delete_object.side_effect = lambda Bucket,Key: stored.pop(Key)
            code = {'api':b'old-code','worker':b'old-code'}
            lam.get_function.return_value = {'Code':{'Location':'https://fixture.invalid/code'}}
            lam.update_function_code.side_effect = lambda FunctionName,ZipFile: code.__setitem__(FunctionName,ZipFile)
            lam.get_function_configuration.side_effect = lambda FunctionName: {'CodeSha256':base64.b64encode(hashlib.sha256(code[FunctionName]).digest()).decode()}
            cf.create_invalidation.return_value = {'Invalidation':{'Id':'id'}}
            session = Mock(); session.client.side_effect = {'s3':s3,'lambda':lam,'cloudfront':cf}.__getitem__
            env = {'SMOKE_'+role+'_'+field:'test-only' for role in ('CUSTOMER','STAFF') for field in ('USERNAME','PASSWORD')}
            with patch.object(deploy_manual,'ROOT',root), patch.object(deploy_manual,'load',return_value=config), patch.object(deploy_manual,'preflight',return_value={}), \
                 patch.object(deploy_manual,'verify'), patch.object(deploy_manual.boto3,'Session',return_value=session), \
                 patch.object(deploy_manual.urllib.request,'urlopen',return_value=io.BytesIO(b'old-code')), \
                 patch.object(deploy_manual,'smoke',return_value={'public':{'status':'PASS'},'customer':{'status':'FAIL'},'staff':{'status':'NOT_VERIFIED'}}), \
                 patch.dict(os.environ,env), patch('sys.argv',['deploy_manual.py','--inventory','unused','--execute']):
                # Each Lambda backup request gets a fresh stream.
                deploy_manual.urllib.request.urlopen.side_effect = lambda *a,**kw: io.BytesIO(b'old-code')
                with self.assertRaisesRegex(RuntimeError,'Release smoke'): deploy_manual.main()
            self.assertEqual(stored, original)
            self.assertEqual(code,{'api':b'old-code','worker':b'old-code'})
            report = json.loads((root/'.build/release/failure.json').read_text())
            self.assertEqual(report['rollbackErrors'],[])
