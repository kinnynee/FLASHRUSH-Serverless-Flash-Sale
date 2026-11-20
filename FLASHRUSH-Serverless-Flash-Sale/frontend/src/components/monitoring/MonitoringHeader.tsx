import { MonitoringStatusBadge } from '../dashboard/DashboardCommon';
import { useDashboard } from '../dashboard/DashboardLayout';

export function MonitoringHeader() {
  const { result } = useDashboard();
  return <div className="dash-header-badges"><span className="dash-tag dash-amber"><span className="dash-dot" />Dữ liệu mô phỏng</span><span className="dash-tag dash-cloud-label">Cloud Console</span><MonitoringStatusBadge snapshot={result.status === 'success' ? result.snapshot : undefined} /></div>;
}
