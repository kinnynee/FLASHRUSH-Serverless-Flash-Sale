import os
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from monitoring import snapshot


class MonitoringTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'MONITORING_API_FUNCTION': 'api', 'MONITORING_WORKER_FUNCTION': 'worker',
            'MONITORING_QUEUE_NAME': 'orders', 'MONITORING_DLQ_NAME': 'dlq',
            'MONITORING_ALARM_NAMES': 'orders-dlq,worker-errors'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = Mock()
        self.client.meta.region_name = 'us-east-1'
        self.client.describe_alarms.return_value = {'MetricAlarms': []}
        self.current = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)

    def result(self, key, values):
        return {'Id': key, 'StatusCode': 'Complete', 'Timestamps': [self.current] * len(values), 'Values': values}

    def test_missing_metrics_remain_unknown_and_dimensions_are_fixed(self):
        self.client.get_metric_data.return_value = {'MetricDataResults': []}
        data = snapshot(15, self.client, self.current)
        self.assertIsNone(data['functions'][0]['invocations'])
        self.assertIsNone(data['queues']['visible'])
        kwargs = self.client.get_metric_data.call_args.kwargs
        self.assertEqual((kwargs['EndTime'] - kwargs['StartTime']).total_seconds(), 900)
        self.assertEqual(len(kwargs['MetricDataQueries']), 16)
        self.assertEqual(kwargs['MetricDataQueries'][0]['MetricStat']['Metric']['Dimensions'], [{'Name': 'FunctionName', 'Value': 'api'}])
        self.client.describe_alarms.assert_called_once_with(AlarmNames=['orders-dlq', 'worker-errors'])

    def test_weighted_duration_sums_and_peak_across_paginated_metrics(self):
        self.client.get_metric_data.side_effect = [
            {'MetricDataResults': [self.result('worker_duration', [100, 900]), self.result('worker_samples', [1, 3]),
                                   self.result('worker_invocations', [2]), self.result('worker_concurrency', [1, 4])], 'NextToken': 'page2'},
            {'MetricDataResults': [self.result('worker_invocations', [8]), self.result('worker_errors', [2]),
                                   self.result('queue_visible', [0])]}]
        data = snapshot(60, self.client, self.current)
        worker = data['functions'][1]
        self.assertEqual(worker['invocations'], 10)
        self.assertEqual(worker['averageDurationMs'], 250)
        self.assertEqual(worker['errorRate'], 20)
        self.assertEqual(worker['maxConcurrency'], 4)
        self.assertEqual(data['queues']['visible']['value'], 0)
        self.assertEqual(self.client.get_metric_data.call_args.kwargs['NextToken'], 'page2')

    def test_partial_results_do_not_claim_to_be_complete(self):
        self.client.get_metric_data.return_value = {'MetricDataResults': [{'Id': 'api_errors', 'StatusCode': 'PartialData'}]}
        with self.assertRaisesRegex(RuntimeError, 'INCOMPLETE'):
            snapshot(60, self.client, self.current)

    def test_alarm_states_and_timestamps_are_preserved(self):
        self.client.get_metric_data.return_value = {'MetricDataResults': []}
        self.client.describe_alarms.return_value = {'MetricAlarms': [
            {'AlarmName': 'orders-dlq', 'StateValue': 'INSUFFICIENT_DATA', 'StateReason': 'No data', 'StateUpdatedTimestamp': self.current}]}
        data = snapshot(60, self.client, self.current)
        self.assertEqual(data['alarms'][0]['state'], 'INSUFFICIENT_DATA')

    def test_unconfigured_monitoring_does_not_call_aws(self):
        with patch.dict(os.environ, {'MONITORING_QUEUE_NAME': ''}):
            with self.assertRaisesRegex(ValueError, 'NOT_CONFIGURED'):
                snapshot(client=self.client)
        self.client.get_metric_data.assert_not_called()
