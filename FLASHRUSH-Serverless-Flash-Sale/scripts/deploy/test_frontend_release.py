import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec=importlib.util.spec_from_file_location('publish_lab_frontend',Path(__file__).resolve().parents[1]/'ci/publish_lab_frontend.py')
publish=importlib.util.module_from_spec(spec);spec.loader.exec_module(publish)

class FrontendReleaseTests(unittest.TestCase):
    def test_rejects_wrong_account_before_any_upload(self):
        session=MagicMock();session.client.return_value.get_caller_identity.return_value={'Account':'000000000000'}
        with self.assertRaisesRegex(ValueError,'Wrong AWS account'):
            publish.preflight(session,Path('unused'))
        session.client.return_value.put_object.assert_not_called()

    def test_origin_mismatch_rejected(self):
        session=MagicMock();session.client.return_value.get_caller_identity.return_value={'Account':publish.ACCOUNT}
        session.client.return_value.get_distribution.return_value={'Distribution':{'DomainName':publish.SITE.removeprefix('https://'),'DistributionConfig':{'Enabled':True,'Origins':{'Items':[{'DomainName':'other.s3.amazonaws.com','OriginPath':''}]}}}}
        with self.assertRaisesRegex(ValueError,'origin mismatch'):
            publish.preflight(session,Path('unused'))

    def test_failed_invalidation_restores_overwritten_index_last(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);dist=root/'frontend/dist';(dist/'assets').mkdir(parents=True)
            (dist/'assets/main.js').write_bytes(b'new-js');(dist/'index.html').write_bytes(b'new-index')
            session=MagicMock();s3=MagicMock();cf=MagicMock();session.client.side_effect=lambda name: {'s3':s3,'cloudfront':cf}[name]
            bodies={'assets/main.js':b'old-js','index.html':b'old-index'}
            state=dict(bodies)
            def read(**kwargs):
                stream=MagicMock();stream.read.return_value=state[kwargs['Key']]
                return {'Body':stream,'ContentType':'text/plain'}
            def write(**kwargs):state[kwargs['Key']]=kwargs['Body']
            s3.get_object.side_effect=read;s3.put_object.side_effect=write
            with patch.object(publish,'ROOT',root),patch.object(publish,'preflight'),patch.object(publish.boto3,'Session',return_value=session),patch.object(publish,'invalidate',side_effect=[RuntimeError('timeout'),None]):
                with self.assertRaisesRegex(RuntimeError,'timeout'):publish.main()
            self.assertEqual(state,bodies)
            self.assertEqual(s3.put_object.call_args.kwargs['Key'],'index.html')
            self.assertTrue((root/'.build/frontend-release/failure.json').exists())
