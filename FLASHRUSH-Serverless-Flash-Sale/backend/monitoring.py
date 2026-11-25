"""Read-only CloudWatch telemetry. Missing datapoints stay unknown, never zero."""
import os
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config


def snapshot(minutes=60, client=None, current=None):
    required = ['MONITORING_API_FUNCTION', 'MONITORING_WORKER_FUNCTION',
                'MONITORING_QUEUE_NAME', 'MONITORING_DLQ_NAME', 'MONITORING_ALARM_NAMES']
    if not all(os.environ.get(key) for key in required):
        raise ValueError('MONITORING_NOT_CONFIGURED')
    client = client or boto3.client('cloudwatch', config=Config(
        connect_timeout=2, read_timeout=4, retries={'max_attempts': 1}))
    end = (current or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    start = end - timedelta(minutes=minutes)
    specs = []
    for prefix, env in [('api', 'MONITORING_API_FUNCTION'), ('worker', 'MONITORING_WORKER_FUNCTION')]:
        for suffix, metric, stat in [('invocations', 'Invocations', 'Sum'), ('errors', 'Errors', 'Sum'),
                                     ('throttles', 'Throttles', 'Sum'), ('duration', 'Duration', 'Sum'),
                                     ('samples', 'Duration', 'SampleCount'), ('concurrency', 'ConcurrentExecutions', 'Maximum')]:
            specs.append((prefix+'_'+suffix, 'AWS/Lambda', metric, 'FunctionName', os.environ[env], stat))
    for key, metric, env in [('queue_visible', 'ApproximateNumberOfMessagesVisible', 'MONITORING_QUEUE_NAME'),
                             ('queue_inflight', 'ApproximateNumberOfMessagesNotVisible', 'MONITORING_QUEUE_NAME'),
                             ('queue_age', 'ApproximateAgeOfOldestMessage', 'MONITORING_QUEUE_NAME'),
                             ('dlq_visible', 'ApproximateNumberOfMessagesVisible', 'MONITORING_DLQ_NAME')]:
        specs.append((key, 'AWS/SQS', metric, 'QueueName', os.environ[env], 'Maximum'))
    queries = [{'Id': key, 'MetricStat': {'Metric': {'Namespace': ns, 'MetricName': metric,
                'Dimensions': [{'Name': dimension, 'Value': name}]}, 'Period': 60, 'Stat': stat},
                'ReturnData': True} for key, ns, metric, dimension, name, stat in specs]
    series = {spec[0]: [] for spec in specs}
    kwargs = dict(MetricDataQueries=queries, StartTime=start, EndTime=end, ScanBy='TimestampAscending')
    while True:
        result = client.get_metric_data(**kwargs)
        if result.get('Messages'):
            raise RuntimeError('CLOUDWATCH_INCOMPLETE_DATA')
        for item in result.get('MetricDataResults', []):
            if item.get('StatusCode') != 'Complete' or item.get('Messages'):
                raise RuntimeError('CLOUDWATCH_INCOMPLETE_DATA')
            series[item['Id']].extend({'at': timestamp.isoformat(), 'value': value}
                                     for timestamp, value in zip(item['Timestamps'], item['Values']))
        if not result.get('NextToken'):
            break
        kwargs['NextToken'] = result['NextToken']
    for points in series.values():
        points.sort(key=lambda point: point['at'])

    def aggregate(key, operation=sum):
        values = [point['value'] for point in series[key]]
        return operation(values) if values else None

    def function(prefix, env):
        duration, samples = aggregate(prefix+'_duration'), aggregate(prefix+'_samples')
        invocations, errors = aggregate(prefix+'_invocations'), aggregate(prefix+'_errors')
        return {'name': os.environ[env], 'invocations': invocations, 'errors': errors,
                'throttles': aggregate(prefix+'_throttles'),
                'averageDurationMs': round(duration / samples, 2) if duration is not None and samples else None,
                'maxConcurrency': aggregate(prefix+'_concurrency', max),
                'errorRate': round(errors / invocations * 100, 2) if invocations and errors is not None else None}

    alarms = []
    alarm_kwargs = {'AlarmNames': os.environ['MONITORING_ALARM_NAMES'].split(',')}
    while True:
        result = client.describe_alarms(**alarm_kwargs)
        alarms.extend({'name': alarm['AlarmName'], 'state': alarm['StateValue'],
                       'reason': alarm['StateReason'], 'updatedAt': alarm['StateUpdatedTimestamp'].isoformat()}
                      for alarm in result.get('MetricAlarms', []))
        if not result.get('NextToken'):
            break
        alarm_kwargs['NextToken'] = result['NextToken']
    return {'source': 'CLOUDWATCH', 'region': client.meta.region_name,
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'window': {'start': start.isoformat(), 'end': end.isoformat(), 'minutes': minutes, 'periodSeconds': 60},
            'functions': [function('api', 'MONITORING_API_FUNCTION'), function('worker', 'MONITORING_WORKER_FUNCTION')],
            'queues': {'name': os.environ['MONITORING_QUEUE_NAME'], 'dlqName': os.environ['MONITORING_DLQ_NAME'],
                       'visible': series['queue_visible'][-1] if series['queue_visible'] else None,
                       'inFlight': series['queue_inflight'][-1] if series['queue_inflight'] else None,
                       'oldestAge': series['queue_age'][-1] if series['queue_age'] else None,
                       'dlqVisible': series['dlq_visible'][-1] if series['dlq_visible'] else None},
            'series': {key: points for key, points in series.items() if not key.endswith(('_samples', '_duration'))},
            'alarms': alarms}
