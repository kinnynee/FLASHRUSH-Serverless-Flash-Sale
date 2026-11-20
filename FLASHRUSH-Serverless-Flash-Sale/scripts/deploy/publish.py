"""Seed catalog without overwriting stock, build HTTP frontend, publish to private S3."""
from datetime import datetime, timedelta, timezone
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess

from lab_config import parser, connect, stack_outputs, manifest
import hashlib
from botocore.exceptions import ClientError

root = Path(__file__).resolve().parents[2]
args = parser().parse_args()
session = connect(args)
outputs = stack_outputs(session, args)
(root/'.build').mkdir(exist_ok=True)
(root/'.build/outputs.json').write_text(json.dumps(outputs, indent=2), encoding='utf-8')
env = {**os.environ, 'VITE_ORDER_MODE': 'http', 'VITE_API_BASE_URL': outputs['ApiUrl']}
subprocess.run([shutil.which('npm.cmd') or 'npm', 'run', 'build'], cwd=root/'frontend', env=env, check=True)
table = session.resource('dynamodb').Table(outputs['ProductsTable'])
for item in json.loads((root/'.build/catalog.json').read_text(encoding='utf-8')):
    item['priceVnd'] = item['price']
    item['initialStock'] = item['stock']
    item['saleEndsAt'] = (datetime.now(timezone.utc)+timedelta(days=7)).isoformat()
    try:
        table.put_item(Item=item, ConditionExpression='attribute_not_exists(productId)')
    except ClientError as exc:
        if exc.response['Error']['Code'] != 'ConditionalCheckFailedException':
            raise
s3 = session.client('s3')
dist = root/'frontend/dist'
files = sorted((p for p in dist.rglob('*') if p.is_file()), key=lambda p: p.name == 'index.html')
if not (dist/'index.html').is_file():
    raise SystemExit('Missing build index')
manifest(args, 'publish', status='prepared', outputs=outputs, files={p.relative_to(dist).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
for path in files:
    if not path.is_file():
        continue
    key = path.relative_to(root/'frontend/dist').as_posix()
    content_type = {'.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}.get(path.suffix, mimetypes.guess_type(key)[0] or 'application/octet-stream')
    s3.upload_file(str(path), outputs['WebsiteBucket'], key, ExtraArgs={'ContentType': content_type,
        'CacheControl': 'no-cache' if key == 'index.html' else 'public,max-age=31536000,immutable' if key.startswith('assets/') else 'public,max-age=3600'})
session.client('cloudfront').create_invalidation(DistributionId=outputs['DistributionId'], InvalidationBatch={
    'Paths': {'Quantity': 1, 'Items': ['/*']}, 'CallerReference': datetime.now(timezone.utc).isoformat()})
print(json.dumps(outputs, indent=2))

manifest(args, 'publish', status='uploaded-invalidation-requested', outputs=outputs)
