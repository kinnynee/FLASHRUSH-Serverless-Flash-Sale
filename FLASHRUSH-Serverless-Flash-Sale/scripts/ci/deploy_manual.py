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
import argparse
from release_check import load, preflight, verify, smoke

ROOT = Path(__file__).resolve().parents[2]

def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--inventory', required=True)
    cli.add_argument('--profile')
    cli.add_argument('--execute', action='store_true', help='Explicitly authorize release after preflight')
    args = cli.parse_args()
    config = load(args.inventory)
    session = boto3.Session(profile_name=args.profile, region_name=config['region'])
    checked = preflight(session, config)
    if not args.execute:
        print(json.dumps({'status':'PREFLIGHT_ONLY', **checked}))
        return
    dist = ROOT/'frontend/dist'
    verify(config, dist)
    if config.get('nonProduction') is not True or not all(os.environ.get('SMOKE_'+role+'_'+field) for role in ('CUSTOMER','STAFF') for field in ('USERNAME','PASSWORD')):
        raise SystemExit('INCOMPLETE_CONFIGURATION: dedicated nonproduction smoke identities required before release')
    r = config['resources']
    s3, lam, cf = (session.client(n) for n in ('s3','lambda','cloudfront'))
    bucket, distribution = r['WebsiteBucket'], r['DistributionId']
    website = r['WebsiteUrl']
    output=ROOT/'.build/release'; output.mkdir(parents=True,exist_ok=True)
    backups={}; changed=[]; written=[]
    for name in (r['ApiFunction'],r['WorkerFunction']):
        d=lam.get_function(FunctionName=name)
        backups[name]=urllib.request.urlopen(d['Code']['Location'],timeout=30).read()
        (output/(name.split(':')[-1]+'-before.zip')).write_bytes(backups[name])
    asset_backups = {}
    for path in (p for p in dist.rglob('*') if p.is_file()):
        key = path.relative_to(dist).as_posix()
        try:
            previous = s3.get_object(Bucket=bucket, Key=key)
            asset_backups[key] = {'Body':previous['Body'].read(), **{k:previous[k] for k in ('ContentType','CacheControl','ContentEncoding','Metadata') if k in previous}}
            target = output/'assets-before'/key
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(asset_backups[key]['Body'])
        except s3.exceptions.NoSuchKey:
            asset_backups[key] = None
    (output/'asset-backups.json').write_text(json.dumps({k: {a:b for a,b in v.items() if a != 'Body'} if v else None for k,v in asset_backups.items()},indent=2),encoding='utf-8')
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for name in ('app.py', 'monitoring.py', 'business.py', 'customer.py', 'vouchers.py'):

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
        for path in sorted((p for p in dist.rglob('*') if p.is_file()),key=lambda p:p.name=='index.html'):
            key=path.relative_to(dist).as_posix(); content=path.read_bytes()
            written.append(key)
            s3.put_object(Bucket=bucket,Key=key,Body=content,ContentType=mimetypes.guess_type(key)[0] or 'application/octet-stream',CacheControl='public,max-age=31536000,immutable' if key.startswith('assets/') else 'no-cache')
            assert hashlib.sha256(s3.get_object(Bucket=bucket,Key=key)['Body'].read()).digest()==hashlib.sha256(content).digest()
        invalidate()
        levels = smoke(session, config)
        report={'commit':os.environ.get('GITHUB_SHA'),'status':'NOT_VERIFIED','smoke':levels,'website':website,'files':written,'backendSha256':expected}
        (output/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        if any(level['status'] != 'PASS' for level in levels.values()):
            raise RuntimeError('Release smoke failed or NOT_VERIFIED')
        report['status'] = 'SMOKE_VERIFIED'
    except Exception as failure:
        rollback_errors = []
        for name in reversed(changed):
            try:
                lam.update_function_code(FunctionName=name,ZipFile=backups[name]);lam.get_waiter('function_updated_v2').wait(FunctionName=name)
            except Exception as exc:
                rollback_errors.append({'resource':name,'errorType':type(exc).__name__})
        for key in reversed(written):
            try:
                if asset_backups[key] is None:
                    s3.delete_object(Bucket=bucket,Key=key)
                else:
                    s3.put_object(Bucket=bucket,Key=key,**asset_backups[key])
            except Exception as exc:
                rollback_errors.append({'resource':key,'errorType':type(exc).__name__})
        try:
            invalidate()
        except Exception as exc:
            rollback_errors.append({'resource':distribution,'errorType':type(exc).__name__})
        (output/'failure.json').write_text(json.dumps({'status':'FAILED','errorType':type(failure).__name__,'rollbackErrors':rollback_errors},indent=2),encoding='utf-8')
        raise
    (output/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))

if __name__=='__main__': main()
