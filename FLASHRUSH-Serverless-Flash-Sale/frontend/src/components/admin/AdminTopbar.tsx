import { NavLink } from 'react-router-dom';
import { BrandLogo } from '../layout/BrandLogo';

export function AdminTopbar() {
  return (
    <header className="site-header dash-topbar">
      <div className="container header-inner dash-topbar-inner">
        <div className="dash-topbar-brand-group">
          <BrandLogo />
        </div>
        <nav className="dash-topnav" aria-label="Điều hướng quản trị chính">
          <NavLink to="/admin" end>Tổng quan Admin</NavLink>
          <NavLink to="/admin/monitoring">Giám sát hệ thống</NavLink>
        </nav>
      </div>
    </header>
  );
}
