"""Deploy existing manual resources; backup and restore on failed release."""
import base64
import hashlib
import io
import json
import mimetypes
import os
from pathlib import Path
import time
import urllib.request
import zipfile
import boto3

ROOT = Path(__file__).resolve().parents[2]

def main():
    session = boto3.Session(region_name='us-east-1')
    assert session.client('sts').get_caller_identity()['Account'] == '303278700480', 'Wrong account'
    s3, lam, cf = (session.client(n) for n in ('s3','lambda','cloudfront'))
    bucket='flashrush-manual-web-303278700480-us-east-1'; distribution='EICTCJNYW9CL1'
    website='https://dybtytxcr1s1a.cloudfront.net'; api='https://56l39g5pqk.execute-api.us-east-1.amazonaws.com'
    output=ROOT/'.build/release'; output.mkdir(parents=True,exist_ok=True)
    backups={}; changed=[]; written=[]
    for name in ('flashrush-manual-api','flashrush-manual-worker'):
        d=lam.get_function(FunctionName=name)
        assert d['Configuration']['Environment']['Variables'].get('CAMPAIGNS_TABLE')=='flashrush-manual-campaigns', 'Campaign migration required'
        backups[name]=urllib.request.urlopen(d['Code']['Location'],timeout=30).read()
        (output/(name+'-before.zip')).write_bytes(backups[name])
    old_index=None
    try: old_index=s3.get_object(Bucket=bucket,Key='index.html')['Body'].read()
    except s3.exceptions.NoSuchKey: pass
    if old_index is not None: (output/'index-before.html').write_bytes(old_index)
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for name in ('app.py', 'monitoring.py', 'customer.py'):
            z.writestr(name, (ROOT/'backend'/name).read_bytes())
    payload=buf.getvalue(); expected=base64.b64encode(hashlib.sha256(payload).digest()).decode()
    def invalidate():
        d=cf.create_invalidation(DistributionId=distribution,InvalidationBatch={'Paths':{'Quantity':1,'Items':['/*']},'CallerReference':os.environ.get('GITHUB_RUN_ID','local')+'-'+str(time.time_ns())})
        cf.get_waiter('invalidation_completed').wait(DistributionId=distribution,Id=d['Invalidation']['Id'])
    try:
        for name in backups:
            changed.append(name)
            lam.update_function_code(FunctionName=name,ZipFile=payload)
            lam.get_waiter('function_updated_v2').wait(FunctionName=name)
            assert lam.get_function_configuration(FunctionName=name)['CodeSha256']==expected
        dist=ROOT/'frontend/dist'
        for path in sorted((p for p in dist.rglob('*') if p.is_file()),key=lambda p:p.name=='index.html'):
            key=path.relative_to(dist).as_posix(); content=path.read_bytes()
            s3.put_object(Bucket=bucket,Key=key,Body=content,ContentType=mimetypes.guess_type(key)[0] or 'application/octet-stream',CacheControl='no-cache' if key=='index.html' else 'public,max-age=31536000,immutable')
            written.append(key)
            assert hashlib.sha256(s3.get_object(Bucket=bucket,Key=key)['Body'].read()).digest()==hashlib.sha256(content).digest()
        invalidate()
        for url in (website+'/',website+'/orders',api+'/products',api+'/campaigns'):
            with urllib.request.urlopen(url,timeout=30) as response: assert response.status==200
        report={'commit':os.environ.get('GITHUB_SHA'),'status':'PASS','website':website,'files':written,'backendSha256':expected}
    except Exception:
        for name in reversed(changed):
            lam.update_function_code(FunctionName=name,ZipFile=backups[name]);lam.get_waiter('function_updated_v2').wait(FunctionName=name)
        if old_index is not None:
            s3.put_object(Bucket=bucket,Key='index.html',Body=old_index,ContentType='text/html',CacheControl='no-cache')
            invalidate()
        raise
    (output/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))

if __name__=='__main__': main()
