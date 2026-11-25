import { Activity, LayoutDashboard, Store } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';

export function AdminSidebar() {
  const { pathname } = useLocation();
  const overviewActive = !pathname.startsWith('/admin/monitoring');
  return (
    <aside className="dash-sidebar">
      <span className="dash-sidebar-label">Quản trị</span>
      <nav className="dash-nav" aria-label="Điều hướng quản trị chính">
        <NavLink to="/admin" end className={overviewActive ? 'active' : undefined} aria-current={overviewActive ? 'page' : undefined}>
          <LayoutDashboard size={18} aria-hidden="true" /><span>Tổng quan Admin</span>
        </NavLink>
        <NavLink to="/admin/monitoring">
          <Activity size={18} aria-hidden="true" /><span>Giám sát hệ thống</span>
        </NavLink>
      </nav>
      <div className="dash-sidebar-footer">
        <Link className="button button-secondary dash-home" to="/"><Store size={16} /> Về cửa hàng</Link>
        <div className="dash-account">
          <span className="dash-avatar" aria-hidden="true">AD</span>
          <div><strong>Quản trị viên</strong><small>FLASHRUSH Store</small></div>
        </div>
      </div>
    </aside>
  );
}
