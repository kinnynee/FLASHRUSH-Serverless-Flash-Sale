import { RefreshCw } from 'lucide-react';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminTopbar } from '../components/admin/AdminTopbar';
import { Button } from '../components/common/Button';
import { DashboardContent, OrderMetricsOverview } from '../components/dashboard/DashboardCommon';
import { scenarioLabels, useDashboard } from '../components/dashboard/DashboardLayout';
import { LambdaMetricsCard, SqsMetricsCard, SystemAlerts } from '../components/monitoring/MonitoringCards';
import type { DashboardScenario } from '../types/dashboard';

export function MonitoringDashboardPage() {
  const { scenario, result, setScenario, refresh } = useDashboard();

  return (
    <>
      <AdminTopbar />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="dash-admin-main">
          <header className="dash-admin-header dash-heading dash-monitor-heading">
            <div>
              <h1>Giám sát hệ thống</h1>
              <p>Theo dõi đơn hàng, hàng đợi SQS và worker trong thời gian thực.</p>
            </div>
            <div className="dash-monitor-actions">
              <label className="dash-scenario-select">
                <span>Kịch bản</span>
                <select value={scenario} onChange={event => setScenario(event.target.value as DashboardScenario)}>
                  {Object.entries(scenarioLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
              <Button variant="secondary" onClick={refresh} disabled={result.status === 'loading'}>
                <RefreshCw size={16} /> Làm mới
              </Button>
            </div>
          </header>
          <div className="dash-admin-body dash-stack">
            <DashboardContent>{snapshot => <>
              <OrderMetricsOverview orders={snapshot.orders} monitoring />
              <div className="dash-monitor-grid">
                <SqsMetricsCard metrics={snapshot.sqs} />
                <LambdaMetricsCard metrics={snapshot.lambda} />
              </div>
              <SystemAlerts alerts={snapshot.alerts} />
            </>}</DashboardContent>
          </div>
        </main>
      </div>
    </>
  );
}
