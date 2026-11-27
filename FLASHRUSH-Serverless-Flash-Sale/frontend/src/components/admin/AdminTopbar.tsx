import { BrandLogo } from '../layout/BrandLogo';

export function AdminTopbar() {
  return (
    <header className="site-header dash-topbar">
      <div className="container header-inner dash-topbar-inner">
        <div className="dash-topbar-brand-group">
          <BrandLogo />
        </div>
        <div className="dash-topbar-status" aria-label="Trạng thái hệ thống">
          <span className="dash-topbar-status-dot" />
          <span>Trung tâm vận hành</span>
          <strong>FLASHRUSH Admin</strong>
        </div>
      </div>
    </header>
  );
}
