import { Link, NavLink } from 'react-router-dom';
import { DashboardBrand, MonitoringStatusBadge } from '../dashboard/DashboardCommon';
import { useDashboard } from '../dashboard/DashboardLayout';

export function MonitoringHeader() {
  const { result } = useDashboard();
  return (
    <header className="dash-console-header">
      <div className="dash-console-inner">
        <DashboardBrand cloud />
        <nav className="dash-nav" aria-label="Điều hướng Cloud Console">
          <NavLink to="/admin" end>Tổng quan Admin</NavLink>
          <NavLink to="/admin/monitoring" end>Giám sát hệ thống</NavLink>
        </nav>
        <div className="dash-console-status">
          <MonitoringStatusBadge snapshot={result.status === 'success' ? result.snapshot : undefined} />
          <Link to="/admin" className="dash-avatar" aria-label="Quản trị viên demo · Về trang quản trị">AD</Link>
        </div>
      </div>
    </header>
  );
}
