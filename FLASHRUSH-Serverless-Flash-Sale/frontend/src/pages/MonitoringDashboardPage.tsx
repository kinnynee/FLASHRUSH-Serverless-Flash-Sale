import { Info, LayoutDashboard, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { DashboardContent, formatSnapshotTime, OrderMetricsOverview } from '../components/dashboard/DashboardCommon';
import { scenarioLabels, useDashboard } from '../components/dashboard/DashboardLayout';
import { LambdaMetricsCard, SqsMetricsCard, SystemAlerts } from '../components/monitoring/MonitoringCards';
import { MonitoringHeader } from '../components/monitoring/MonitoringHeader';
import type { DashboardScenario } from '../types/dashboard';

export function MonitoringDashboardPage() {
  const { scenario, result, setScenario, refresh } = useDashboard();
  return (
    <>
      <MonitoringHeader />
      <main id="main-content" tabIndex={-1} className="dash-monitor-main">
        <header className="dash-heading dash-monitor-heading">
          <div>
            <div className="dash-monitor-title"><h1>Giám sát hệ thống</h1><span className="dash-tag dash-amber">DỮ LIỆU MÔ PHỎNG — CHƯA KẾT NỐI AWS</span></div>
            <p>Theo dõi xử lý đơn hàng, hàng đợi và worker trong phiên demo.</p>
          </div>
          <div className="dash-monitor-actions">
            <Button variant="secondary" onClick={refresh} disabled={result.status === 'loading'}><RefreshCw size={16} /> Làm mới dữ liệu</Button>
            <Link className="button button-primary" to="/admin"><LayoutDashboard size={16} /> Về trang Admin</Link>
          </div>
        </header>
        <div className="dash-stack">
          <DashboardContent>{snapshot => <>
            <div>
              <OrderMetricsOverview orders={snapshot.orders} monitoring />
              <div className="dash-note dash-blue">
                <Info size={17} aria-hidden="true" />
                <p><strong>HTTP 202 Accepted</strong> chỉ xác nhận yêu cầu đã được tiếp nhận. Kết quả mua hàng phụ thuộc vào quá trình xử lý bất đồng bộ.</p>
              </div>
            </div>
            <div className="dash-monitor-grid">
              <SqsMetricsCard metrics={snapshot.sqs} />
              <LambdaMetricsCard metrics={snapshot.lambda} />
            </div>
            <SystemAlerts alerts={snapshot.alerts} />
          </>}</DashboardContent>
          <section className="dash-card dash-controls" aria-labelledby="dash-controls">
            <div>
              <h2 id="dash-controls">Dữ liệu demo</h2>
              <p>{result.status === 'success' ? <>Snapshot <time dateTime={result.snapshot.updatedAt}>{formatSnapshotTime(result.snapshot.updatedAt)}</time> (GMT+7)</> : 'Chọn kịch bản để tải snapshot mô phỏng.'}</p>
            </div>
            <label>
              Kịch bản mô phỏng
              <select value={scenario} onChange={event => setScenario(event.target.value as DashboardScenario)}>
                {Object.entries(scenarioLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          </section>
        </div>
      </main>
    </>
  );
}
