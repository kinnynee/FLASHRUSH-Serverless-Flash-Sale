import { NavLink } from 'react-router-dom';
import { BrandLogo } from '../layout/BrandLogo';
import { useState, type FormEvent } from 'react';
import { Button } from '../common/Button';
import { getAdminKey, setAdminKey } from '../../services/adminAuth';
import { useDashboard } from '../dashboard/DashboardLayout';

export function AdminTopbar() {
  const [key, setKey] = useState(getAdminKey);
  const { refresh } = useDashboard();
  function connect(event: FormEvent) {
    event.preventDefault();
    setAdminKey(key.trim());
    refresh();
  }
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
        <form className="dash-admin-auth" onSubmit={connect}>
          <label className="sr-only" htmlFor="admin-api-key">Admin API key</label>
          <input id="admin-api-key" type="password" autoComplete="current-password" value={key}
            onChange={event => setKey(event.target.value)} placeholder="Admin API key" />
          <Button type="submit">Kết nối</Button>
        </form>
      </div>
    </header>
  );
}
