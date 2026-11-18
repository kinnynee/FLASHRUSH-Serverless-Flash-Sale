"""Reproducible FLASHRUSH lab deployment. Requires boto3 and AWS login profile.

AWS references: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/
"""
import argparse
import hashlib
import json
import time
from pathlib import Path
import zipfile

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[2]


def template(bucket, code_key):
    ref = lambda x: {'Ref': x}
    arn = lambda x: {'Fn::GetAtt': [x, 'Arn']}
    sub = lambda x: {'Fn::Sub': x}
    resources = {}
    def resource(name, kind, properties, **extra):
        resources[name] = {'Type': 'AWS::' + kind, 'Properties': properties, **extra}
    for name, pk in [('Products', 'productId'), ('Orders', 'orderId')]:
        resource(name, 'DynamoDB::Table', {'TableName': 'flashrush-lab-' + name.lower(), 'BillingMode': 'PAY_PER_REQUEST',
            'AttributeDefinitions': [{'AttributeName': pk, 'AttributeType': 'S'}],
            'KeySchema': [{'AttributeName': pk, 'KeyType': 'HASH'}], 'SSESpecification': {'SSEEnabled': True}})
    resource('DLQ', 'SQS::Queue', {'QueueName': 'flashrush-lab-dlq', 'MessageRetentionPeriod': 1209600,
        'SqsManagedSseEnabled': True, 'RedriveAllowPolicy': {'redrivePermission': 'byQueue',
        'sourceQueueArns': [sub('arn:${AWS::Partition}:sqs:${AWS::Region}:${AWS::AccountId}:flashrush-lab-orders')]}})
    resource('Queue', 'SQS::Queue', {'QueueName': 'flashrush-lab-orders', 'VisibilityTimeout': 90,
        'MessageRetentionPeriod': 345600, 'ReceiveMessageWaitTimeSeconds': 20, 'SqsManagedSseEnabled': True,
        'RedrivePolicy': {'deadLetterTargetArn': arn('DLQ'), 'maxReceiveCount': 5}})
    for role, statements in [('ApiRole', [
        {'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:Scan'], 'Resource': arn('Products')},
        {'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'], 'Resource': arn('Orders')},
        {'Effect': 'Allow', 'Action': 'sqs:SendMessage', 'Resource': arn('Queue')}]),
        ('WorkerRole', [
        {'Effect': 'Allow', 'Action': ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'], 'Resource': arn('Queue')},
        {'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem'], 'Resource': [arn('Products'), arn('Orders')]}])]:
        function = 'api' if role == 'ApiRole' else 'worker'
        statements.append({'Effect': 'Allow', 'Action': ['logs:CreateLogStream', 'logs:PutLogEvents'],
            'Resource': sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/flashrush-lab-' + function + ':*')})
        resource(role, 'IAM::Role', {'AssumeRolePolicyDocument': {'Version': '2012-10-17', 'Statement': [
            {'Effect': 'Allow', 'Principal': {'Service': 'lambda.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]},
            'Policies': [{'PolicyName': 'flashrush-runtime', 'PolicyDocument': {'Version': '2012-10-17', 'Statement': statements}}]})
    for name, handler, role in [('Api', 'api', 'ApiRole'), ('Worker', 'worker', 'WorkerRole')]:
        resource(name+'Log', 'Logs::LogGroup', {'LogGroupName': '/aws/lambda/flashrush-lab-'+handler, 'RetentionInDays': 7})
        resource(name, 'Lambda::Function', {'FunctionName': 'flashrush-lab-'+handler, 'Runtime': 'python3.12',
            'Handler': 'app.'+handler, 'Role': arn(role), 'Timeout': 15, 'MemorySize': 256,
            'Code': {'S3Bucket': bucket, 'S3Key': code_key}, 'Environment': {'Variables': {
                'PRODUCTS_TABLE': ref('Products'), 'ORDERS_TABLE': ref('Orders'), 'QUEUE_URL': ref('Queue')}},
            'Architectures': ['arm64']}, DependsOn=name+'Log')
    resource('Mapping', 'Lambda::EventSourceMapping', {'EventSourceArn': arn('Queue'), 'FunctionName': ref('Worker'),
        'BatchSize': 1, 'MaximumBatchingWindowInSeconds': 0, 'FunctionResponseTypes': ['ReportBatchItemFailures'],
        'ScalingConfig': {'MaximumConcurrency': 5}, 'Enabled': True})
    resource('HttpApi', 'ApiGatewayV2::Api', {'Name': 'flashrush-lab-api', 'ProtocolType': 'HTTP',
        'CorsConfiguration': {'AllowOrigins': [sub('https://${Distribution.DomainName}'), 'http://localhost:5173', 'http://127.0.0.1:5173'],
            'AllowMethods': ['GET', 'POST', 'OPTIONS'], 'AllowHeaders': ['content-type', 'idempotency-key', 'x-order-token'], 'MaxAge': 300}})
    resource('Integration', 'ApiGatewayV2::Integration', {'ApiId': ref('HttpApi'), 'IntegrationType': 'AWS_PROXY',
        'IntegrationUri': arn('Api'), 'PayloadFormatVersion': '2.0', 'TimeoutInMillis': 20000})
    for i, route in enumerate(['GET /products', 'GET /products/{productId}', 'POST /orders', 'GET /orders/{orderId}']):
        resource('Route'+str(i), 'ApiGatewayV2::Route', {'ApiId': ref('HttpApi'), 'RouteKey': route,
            'Target': {'Fn::Join': ['/', ['integrations', ref('Integration')]]}})
    resource('AccessLog', 'Logs::LogGroup', {'LogGroupName': '/aws/apigateway/flashrush-lab', 'RetentionInDays': 7})
    resource('Stage', 'ApiGatewayV2::Stage', {'ApiId': ref('HttpApi'), 'StageName': '$default', 'AutoDeploy': True,
        'DefaultRouteSettings': {'ThrottlingBurstLimit': 10, 'ThrottlingRateLimit': 5, 'DetailedMetricsEnabled': False},
        'AccessLogSettings': {'DestinationArn': arn('AccessLog'), 'Format': '{"requestId":"$context.requestId","status":"$context.status","routeKey":"$context.routeKey","latency":"$context.responseLatency"}'}})
    resource('ApiPermission', 'Lambda::Permission', {'Action': 'lambda:InvokeFunction', 'FunctionName': ref('Api'),
        'Principal': 'apigateway.amazonaws.com', 'SourceArn': sub('arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*')})
    resource('Website', 'S3::Bucket', {'BucketName': sub('flashrush-lab-web-${AWS::AccountId}-${AWS::Region}'),
        'PublicAccessBlockConfiguration': {'BlockPublicAcls': True, 'BlockPublicPolicy': True, 'IgnorePublicAcls': True, 'RestrictPublicBuckets': True},
        'BucketEncryption': {'ServerSideEncryptionConfiguration': [{'ServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]}})
    resource('OAC', 'CloudFront::OriginAccessControl', {'OriginAccessControlConfig': {'Name': 'flashrush-lab-oac',
        'OriginAccessControlOriginType': 's3', 'SigningBehavior': 'always', 'SigningProtocol': 'sigv4'}})
    resource('Distribution', 'CloudFront::Distribution', {'DistributionConfig': {'Enabled': True, 'DefaultRootObject': 'index.html',
        'PriceClass': 'PriceClass_100', 'HttpVersion': 'http2', 'IPV6Enabled': True,
        'Origins': [{'Id': 'website', 'DomainName': {'Fn::GetAtt': ['Website', 'RegionalDomainName']},
            'OriginAccessControlId': ref('OAC'), 'S3OriginConfig': {'OriginAccessIdentity': ''}}],
        'DefaultCacheBehavior': {'TargetOriginId': 'website', 'ViewerProtocolPolicy': 'redirect-to-https',
            'AllowedMethods': ['GET', 'HEAD'], 'Compress': True, 'CachePolicyId': '658327ea-f89d-4fab-a63d-7e88639e58f6'},
        'CustomErrorResponses': [{'ErrorCode': c, 'ResponseCode': 200, 'ResponsePagePath': '/index.html', 'ErrorCachingMinTTL': 0} for c in [403, 404]],
        'ViewerCertificate': {'CloudFrontDefaultCertificate': True}}})
    resource('WebsitePolicy', 'S3::BucketPolicy', {'Bucket': ref('Website'), 'PolicyDocument': {'Version': '2012-10-17', 'Statement': [
        {'Effect': 'Allow', 'Principal': {'Service': 'cloudfront.amazonaws.com'}, 'Action': 's3:GetObject',
            'Resource': sub('${Website.Arn}/*'), 'Condition': {'StringEquals': {'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}')}}},
        {'Effect': 'Deny', 'Principal': '*', 'Action': 's3:*', 'Resource': [arn('Website'), sub('${Website.Arn}/*')],
            'Condition': {'Bool': {'aws:SecureTransport': 'false'}}}]}})
    resource('Alerts', 'SNS::Topic', {'TopicName': 'flashrush-lab-alerts'})
    resource('AlertsPolicy', 'SNS::TopicPolicy', {'Topics': [ref('Alerts')], 'PolicyDocument': {
        'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'cloudwatch.amazonaws.com'},
            'Action': 'sns:Publish', 'Resource': ref('Alerts'), 'Condition': {
                'StringEquals': {'aws:SourceAccount': ref('AWS::AccountId')},
                'ArnLike': {'aws:SourceArn': sub('arn:${AWS::Partition}:cloudwatch:${AWS::Region}:${AWS::AccountId}:alarm:flashrush-lab-*')}}}]}})
    for name, namespace, metric, dimension, threshold in [
        ('DLQAlarm', 'AWS/SQS', 'ApproximateNumberOfMessagesVisible', {'Name': 'QueueName', 'Value': {'Fn::GetAtt': ['DLQ', 'QueueName']}}, 1),
        ('WorkerErrorAlarm', 'AWS/Lambda', 'Errors', {'Name': 'FunctionName', 'Value': ref('Worker')}, 1),
        ('QueueAgeAlarm', 'AWS/SQS', 'ApproximateAgeOfOldestMessage', {'Name': 'QueueName', 'Value': {'Fn::GetAtt': ['Queue', 'QueueName']}}, 300)]:
        resource(name, 'CloudWatch::Alarm', {'AlarmName': 'flashrush-lab-'+name.lower(), 'Namespace': namespace,
            'MetricName': metric, 'Dimensions': [dimension], 'Statistic': 'Maximum', 'Period': 60,
            'EvaluationPeriods': 1, 'Threshold': threshold, 'ComparisonOperator': 'GreaterThanOrEqualToThreshold',
            'TreatMissingData': 'notBreaching', 'AlarmActions': [ref('Alerts')]})
    outputs = {name: {'Value': value} for name, value in {
        'ApiUrl': {'Fn::GetAtt': ['HttpApi', 'ApiEndpoint']}, 'WebsiteUrl': sub('https://${Distribution.DomainName}'),
        'WebsiteBucket': ref('Website'), 'DistributionId': ref('Distribution'), 'ProductsTable': ref('Products'),
        'OrdersTable': ref('Orders'), 'QueueUrl': ref('Queue'), 'DLQUrl': ref('DLQ'), 'AlertsTopicArn': ref('Alerts')}.items()}
    return {'AWSTemplateFormatVersion': '2010-09-09', 'Description': 'FLASHRUSH isolated lab; nine application services', 'Resources': resources, 'Outputs': outputs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', default='dropit-admin')
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()
    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    account = session.client('sts').get_caller_identity()['Account']
    s3 = session.client('s3')
    bucket = f'flashrush-lab-artifacts-{account}-{args.region}'
    try:
        s3.head_bucket(Bucket=bucket, ExpectedBucketOwner=account)
    except ClientError as exc:
        if exc.response['Error']['Code'] not in ('404', 'NoSuchBucket'):
            raise
        params = {'Bucket': bucket}
        if args.region != 'us-east-1':
            params['CreateBucketConfiguration'] = {'LocationConstraint': args.region}
        s3.create_bucket(**params)
    s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration={
        'BlockPublicAcls': True, 'IgnorePublicAcls': True, 'BlockPublicPolicy': True, 'RestrictPublicBuckets': True})
    s3.put_bucket_encryption(Bucket=bucket, ServerSideEncryptionConfiguration={
        'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]})
    s3.put_bucket_tagging(Bucket=bucket, Tagging={'TagSet': [{'Key': 'Project', 'Value': 'FLASHRUSH'}, {'Key': 'Environment', 'Value': 'lab'}]})
    build = ROOT / '.build'
    build.mkdir(exist_ok=True)
    code = build / 'backend.zip'
    with zipfile.ZipFile(code, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.write(ROOT / 'backend/app.py', 'app.py')
    key = 'lambda/' + hashlib.sha256(code.read_bytes()).hexdigest() + '.zip'
    s3.upload_file(str(code), bucket, key)
    document = template(bucket, key)
    target = ROOT / 'infrastructure/templates/flashrush.json'
    target.write_text(json.dumps(document, indent=2)+'\n', encoding='utf-8')
    cf = session.client('cloudformation')
    cf.validate_template(TemplateBody=json.dumps(document))
    stack = 'flashrush-lab'
    change = 'deploy-' + hashlib.sha256(json.dumps(document).encode()).hexdigest()[:12] + '-' + str(int(time.time()))
    try:
        cf.describe_stacks(StackName=stack)
        kind = 'UPDATE'
    except ClientError as exc:
        if 'does not exist' not in str(exc):
            raise
        kind = 'CREATE'
    cf.create_change_set(StackName=stack, ChangeSetName=change, ChangeSetType=kind, TemplateBody=json.dumps(document),
        Capabilities=['CAPABILITY_IAM'], Tags=[{'Key': 'Project', 'Value': 'FLASHRUSH'}, {'Key': 'Environment', 'Value': 'lab'}, {'Key': 'Owner', 'Value': 'FLASHRUSH-team'}])
    try:
        cf.get_waiter('change_set_create_complete').wait(StackName=stack, ChangeSetName=change)
    except Exception:
        state = cf.describe_change_set(StackName=stack, ChangeSetName=change)
        if "didn't contain changes" in state.get('StatusReason', '') or 'No updates' in state.get('StatusReason', ''):
            print('No infrastructure changes required.', flush=True)
            cf.delete_change_set(StackName=stack, ChangeSetName=change)
            return
        raise
    changes = cf.describe_change_set(StackName=stack, ChangeSetName=change)
    (build/'change-set.json').write_text(json.dumps(changes, default=str, indent=2), encoding='utf-8')
    print('Validated change set:', kind, len(changes.get('Changes', [])), 'resources', flush=True)
    cf.execute_change_set(StackName=stack, ChangeSetName=change)
    print('Deployment started. Stack:', stack, flush=True)


if __name__ == '__main__':
    main()
