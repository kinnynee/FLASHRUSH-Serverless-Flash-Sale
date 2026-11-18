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
        <span className="dash-tag">Standard Queue</span>
      </div>
      <p>Hàng đợi bất đồng bộ chuyển yêu cầu đặt hàng đến worker.</p>
      <dl className="dash-metric-grid">
        <div><dt>Approximate Messages Visible</dt><dd>{visibleMessages}</dd><small>Đang chờ nhận</small></div>
        <div><dt>Messages In Flight</dt><dd>{inFlightMessages}</dd><small>Đã nhận, đang xử lý</small></div>
        <div className={needsReview ? 'dash-red' : undefined}><dt>DLQ Message Count</dt><dd>{dlqMessages}</dd><small>Message cần kiểm tra</small></div>
      </dl>
      <div className="dash-telemetry-footer">
        <span>Queue Status</span>
        <span className={`dash-tag ${needsReview ? 'dash-red' : 'dash-green'}`}><span className="dash-dot" />{needsReview ? 'DLQ cần kiểm tra' : 'Sẵn sàng · Demo'}</span>
      </div>
      <p>Các chỉ số message mô tả tải hàng đợi. Số yêu cầu duy nhất được tính từ danh sách đơn.</p>
    </section>
  );
}

export function LambdaMetricsCard({ metrics }: { metrics: LambdaMetrics }) {
  const { invocations, errors, averageDurationMs, concurrency, durationBreakdown, runtime } = metrics;
  const errorRate = invocations ? errors / invocations * 100 : 0;
  const totalDuration = durationBreakdown.reduce((total, stage) => total + stage.ms, 0);
  return (
    <section className="dash-card dash-telemetry">
      <div className="dash-section-heading">
        <h2><span className="dash-icon dash-red"><Zap size={19} /></span> AWS Lambda Worker</h2>
        <span className="dash-tag">{runtime ?? 'Runtime chưa cấu hình'}</span>
      </div>
      <p>Worker xử lý yêu cầu đặt hàng từ Amazon SQS.</p>
      <dl className="dash-metric-grid">
        <div><dt>Invocations</dt><dd>{invocations}</dd><small>Lượt thực thi</small></div>
        <div className={errors > 0 ? 'dash-red' : undefined}><dt>Errors</dt><dd>{errors}</dd><small>{errorRate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% lượt thực thi</small></div>
        <div><dt>Average Duration</dt><dd>{averageDurationMs} <small>ms</small></dd><small>Thời gian trung bình</small></div>
      </dl>
      <div className="dash-duration">
        <div className="dash-telemetry-footer"><strong>Duration Breakdown</strong><span className="dash-tag dash-amber">Mô phỏng</span></div>
        {totalDuration > 0 ? (
          <>
            <div className="dash-duration-bar" aria-hidden="true">
              {durationBreakdown.map(stage => <span key={stage.label} style={{ flexGrow: stage.ms }} />)}
            </div>
            <ul className="dash-duration-legend">
              {durationBreakdown.map(stage => <li key={stage.label}><span className="dash-dot" />{stage.label} ({stage.ms} ms)</li>)}
            </ul>
          </>
        ) : <p>Chưa có số liệu thời gian xử lý.</p>}
      </div>
      <div className="dash-telemetry-footer"><span>Worker Concurrency</span><strong>{concurrency}</strong></div>
      <p>Retry có thể tăng số lượt thực thi. Lambda Errors và đơn FAILED được đếm riêng.</p>
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
      <div className="dash-section-heading">
        <div><h2><TriangleAlert size={18} /> Cảnh báo hệ thống</h2><p>Nhật ký vận hành mô phỏng của phiên demo</p></div>
        <span className="dash-tag">{alerts.length} sự kiện</span>
      </div>
      {alerts.length === 0 ? <EmptyState title="Chưa có cảnh báo" description="Phiên mô phỏng chưa ghi nhận sự kiện." /> : (
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
