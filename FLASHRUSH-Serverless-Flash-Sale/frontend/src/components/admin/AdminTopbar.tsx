import { BrandLogo } from '../layout/BrandLogo';

export function AdminTopbar() {
  return (
    <header className="site-header dash-topbar">
      <div className="container header-inner dash-topbar-inner">
        <div className="dash-topbar-brand-group">
          <BrandLogo />
        </div>
      </div>
    </header>
  );
}
