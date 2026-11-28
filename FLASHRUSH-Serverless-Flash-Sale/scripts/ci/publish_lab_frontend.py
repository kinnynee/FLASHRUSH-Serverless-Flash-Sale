"""Publish only the fixed lab frontend; leave API, IAM and data unchanged."""
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import time
import urllib.request
import boto3

ROOT = Path(__file__).resolve().parents[2]
ACCOUNT = '303278700480'
BUCKET = 'flashrush-lab-web-303278700480-us-east-1'
DISTRIBUTION = 'E1UN1ZTHCN0K5T'
SITE = 'https://d1jcrzj4650vey.cloudfront.net'
API = 'https://7h0r2fxsha.execute-api.us-east-1.amazonaws.com'


def preflight(session, directory):
    if session.client('sts').get_caller_identity()['Account'] != ACCOUNT:
        raise ValueError('Wrong AWS account')
    config = session.client('cloudfront').get_distribution(Id=DISTRIBUTION)['Distribution']
    origins = config['DistributionConfig']['Origins']['Items']
    if (config['DomainName'] != SITE.removeprefix('https://') or
            not config['DistributionConfig']['Enabled'] or
            len(origins) != 1 or not origins[0]['DomainName'].startswith(BUCKET + '.s3.') or origins[0].get('OriginPath')):
        raise ValueError('Lab distribution/origin mismatch')
    session.client('s3').head_bucket(Bucket=BUCKET, ExpectedBucketOwner=ACCOUNT)
    if not (directory / 'index.html').is_file():
        raise ValueError('Missing build index')
    scripts = list((directory / 'assets').glob('*.js'))
    if not any(API in p.read_text(encoding='utf-8') for p in scripts):
        raise ValueError('Frontend does not target lab API')
    for path in ('/products', '/campaigns'):
        with urllib.request.urlopen(API + path, timeout=20) as response:
            if response.status != 200 or 'items' not in json.load(response):
                raise ValueError('Public API preflight failed')


def invalidate(cf):
    result = cf.create_invalidation(DistributionId=DISTRIBUTION, InvalidationBatch={
        'Paths': {'Quantity': 1, 'Items': ['/*']}, 'CallerReference': 'frontend-' + str(time.time_ns())})
    cf.get_waiter('invalidation_completed').wait(DistributionId=DISTRIBUTION, Id=result['Invalidation']['Id'],
                                               WaiterConfig={'Delay': 10, 'MaxAttempts': 90})


def main():
    session = boto3.Session(region_name='us-east-1')
    directory = ROOT / 'frontend/dist'
    preflight(session, directory)
    s3, cf = session.client('s3'), session.client('cloudfront')
    output = ROOT / '.build/frontend-release'
    output.mkdir(parents=True, exist_ok=True)
    backups, written, manifest = {}, [], {}
    files = sorted((p for p in directory.rglob('*') if p.is_file()), key=lambda p: (p.name == 'index.html', str(p)))
    for path in files:
        key = path.relative_to(directory).as_posix()
        manifest[key] = hashlib.sha256(path.read_bytes()).hexdigest()
        try:
            old = s3.get_object(Bucket=BUCKET, Key=key, ExpectedBucketOwner=ACCOUNT)
            backups[key] = {'Body': old['Body'].read(), **{k: old[k] for k in ('ContentType', 'CacheControl', 'ContentEncoding', 'Metadata') if k in old}}
            target = output / 'before' / key
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(backups[key]['Body'])
        except s3.exceptions.NoSuchKey:
            backups[key] = None
    (output / 'manifest.json').write_text(json.dumps({'commit': os.environ.get('GITHUB_SHA'), 'files': manifest}, indent=2))
    (output / 'metadata-before.json').write_text(json.dumps({k: {a:b for a,b in v.items() if a != 'Body'} if v else None for k,v in backups.items()}, indent=2))
    try:
        for path in files:
            key = path.relative_to(directory).as_posix()
            content = path.read_bytes()
            kind = {'js':'application/javascript', 'css':'text/css', 'html':'text/html'}.get(path.suffix[1:], mimetypes.guess_type(key)[0] or 'application/octet-stream')
            written.append(key)
            s3.put_object(Bucket=BUCKET, Key=key, Body=content, ContentType=kind, ExpectedBucketOwner=ACCOUNT,
                          CacheControl='no-cache, no-store, must-revalidate' if key == 'index.html' else 'max-age=300')
            actual = s3.get_object(Bucket=BUCKET, Key=key, ExpectedBucketOwner=ACCOUNT)['Body'].read()
            if hashlib.sha256(actual).hexdigest() != manifest[key]:
                raise ValueError('Uploaded object hash mismatch')
        invalidate(cf)
        expected = (directory / 'index.html').read_bytes()
        for path in ('/', '/staff/login', '/admin', '/cart/checkout'):
            with urllib.request.urlopen(SITE + path, timeout=30) as response:
                if response.status != 200 or response.read() != expected:
                    raise ValueError('CloudFront build mismatch: ' + path)
    except Exception:
        # Restore all overwritten objects; restore index last. Retain new hashed assets
        # for browsers that briefly fetched the new index during this release.
        errors = []
        for key in written:
            if backups[key] is not None:
                try:
                    s3.put_object(Bucket=BUCKET, Key=key, ExpectedBucketOwner=ACCOUNT, **backups[key])
                except Exception as exc:
                    errors.append({'key':key,'errorType':type(exc).__name__})
        try:
            invalidate(cf)
        except Exception as exc:
            errors.append({'resource':DISTRIBUTION,'errorType':type(exc).__name__})
        (output / 'failure.json').write_text(json.dumps({'status':'FAILED','rollbackErrors':errors}, indent=2))
        raise
    result = {'status':'VERIFIED','commit':os.environ.get('GITHUB_SHA'),'website':SITE,'files':len(files),'indexSha256':manifest['index.html']}
    (output / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
