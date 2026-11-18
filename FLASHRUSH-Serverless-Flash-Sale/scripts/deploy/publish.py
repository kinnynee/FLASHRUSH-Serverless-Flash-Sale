"""Seed catalog without overwriting stock, build HTTP frontend, publish to private S3."""
from datetime import datetime, timedelta, timezone
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess

import boto3
from botocore.exceptions import ClientError

root = Path(__file__).resolve().parents[2]
session = boto3.Session(profile_name='dropit-admin', region_name='us-east-1')
outputs = {o['OutputKey']: o['OutputValue'] for o in session.client('cloudformation').describe_stacks(StackName='flashrush-lab')['Stacks'][0]['Outputs']}
(root/'.build/outputs.json').write_text(json.dumps(outputs, indent=2), encoding='utf-8')
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
env = {**os.environ, 'VITE_ORDER_MODE': 'http', 'VITE_API_BASE_URL': outputs['ApiUrl']}
subprocess.run([shutil.which('npm.cmd') or 'npm', 'run', 'build'], cwd=root/'frontend', env=env, check=True)
s3 = session.client('s3')
for path in (root/'frontend/dist').rglob('*'):
    if not path.is_file():
        continue
    key = path.relative_to(root/'frontend/dist').as_posix()
    content_type = {'.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}.get(path.suffix, mimetypes.guess_type(key)[0] or 'application/octet-stream')
    s3.upload_file(str(path), outputs['WebsiteBucket'], key, ExtraArgs={'ContentType': content_type,
        'CacheControl': 'no-cache' if key == 'index.html' else 'public,max-age=31536000,immutable' if key.startswith('assets/') else 'public,max-age=3600'})
session.client('cloudfront').create_invalidation(DistributionId=outputs['DistributionId'], InvalidationBatch={
    'Paths': {'Quantity': 1, 'Items': ['/*']}, 'CallerReference': datetime.now(timezone.utc).isoformat()})
print(json.dumps(outputs, indent=2))
