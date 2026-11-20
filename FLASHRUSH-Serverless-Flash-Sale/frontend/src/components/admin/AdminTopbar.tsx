import { Zap } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

export function AdminTopbar() {
  return (
    <header className="dash-topbar">
      <div className="dash-topbar-inner">
        <Link className="brand dash-topbar-brand" to="/" aria-label="FLASHRUSH — Trang chủ demo">
          <Zap fill="currentColor" strokeWidth={0} />
          FLASHRUSH
        </Link>
        <span className="demo-badge">Quản trị demo</span>
        <nav className="dash-topnav" aria-label="Điều hướng quản trị chính">
          <NavLink to="/admin" end>Tổng quan Admin</NavLink>
          <NavLink to="/admin/monitoring">Giám sát hệ thống</NavLink>
        </nav>
      </div>
    </header>
  );
}
