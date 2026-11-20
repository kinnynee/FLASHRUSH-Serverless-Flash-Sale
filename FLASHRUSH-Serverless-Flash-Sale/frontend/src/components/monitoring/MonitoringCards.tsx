import { Layers3, TriangleAlert, Zap } from 'lucide-react';
import type { DashboardAlert, LambdaMetrics, SqsMetrics } from '../../types/dashboard';
import { EmptyState } from '../common/EmptyState';
import { formatTime } from '../dashboard/DashboardCommon';

export function SqsMetricsCard({ metrics }: { metrics: SqsMetrics }) {
  const { visibleMessages, inFlightMessages, dlqMessages } = metrics;
  const needsReview = dlqMessages > 0;
  return (
    <section className="dash-card dash-telemetry">
      <div className="dash-section-heading">
        <h2><span className="dash-icon dash-amber"><Layers3 size={19} /></span> Amazon SQS</h2>
        <span className={`dash-tag ${needsReview ? 'dash-red' : 'dash-green'}`}><span className="dash-dot" />{needsReview ? 'Cần kiểm tra DLQ' : 'Sẵn sàng'}</span>
      </div>
      <dl className="dash-metric-grid">
        <div><dt>Messages Visible</dt><dd>{visibleMessages}</dd><small>Đang chờ xử lý</small></div>
        <div><dt>In Flight</dt><dd>{inFlightMessages}</dd><small>Đang xử lý</small></div>
        <div className={needsReview ? 'dash-red' : undefined}><dt>DLQ Messages</dt><dd>{dlqMessages}</dd><small>Cần kiểm tra</small></div>
      </dl>
    </section>
  );
}

export function LambdaMetricsCard({ metrics }: { metrics: LambdaMetrics }) {
  const { invocations, errors, averageDurationMs, concurrency, runtime } = metrics;
  const errorRate = invocations ? errors / invocations * 100 : 0;
  return (
    <section className="dash-card dash-telemetry">
      <div className="dash-section-heading">
        <h2><span className="dash-icon dash-red"><Zap size={19} /></span> AWS Lambda Worker</h2>
        <span className="dash-tag">{runtime ?? 'Chưa cấu hình'}</span>
      </div>
      <dl className="dash-metric-grid">
        <div><dt>Invocations</dt><dd>{invocations}</dd><small>Lượt thực thi</small></div>
        <div className={errors > 0 ? 'dash-red' : undefined}><dt>Errors</dt><dd>{errors}</dd><small>{errorRate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</small></div>
        <div><dt>Average Duration</dt><dd>{averageDurationMs} <small>ms</small></dd><small>Trung bình</small></div>
      </dl>
      <div className="dash-telemetry-footer"><span>Worker Concurrency</span><strong>{concurrency}</strong></div>
    </section>
  );
}

const alertStyles = {
  CRITICAL: { label: 'Nghiêm trọng', tone: 'red' },
  WARNING: { label: 'Cảnh báo', tone: 'amber' },
  INFO: { label: 'Thông tin', tone: 'green' },
};

export function SystemAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className="dash-card dash-alerts">
      <div className="dash-section-heading"><h2><TriangleAlert size={18} /> Cảnh báo hệ thống</h2></div>
      {alerts.length === 0 ? <EmptyState title="Không có cảnh báo" description="Hệ thống chưa ghi nhận sự kiện cần theo dõi." /> : (
        <ul className="dash-alert-list">
          {alerts.map(alert => {
            const { label, tone } = alertStyles[alert.severity];
            return (
              <li key={alert.id} className={`dash-alert dash-${tone}`}>
                <span className="dash-tag">{label}</span>
                <time dateTime={alert.createdAt}>{formatTime(alert.createdAt)}</time>
                <p>{alert.message}</p>
                <span className="dash-alert-status">{alert.status === 'OPEN' ? 'Cần theo dõi' : 'Đã ghi nhận'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
