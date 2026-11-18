import { ChartNoAxesCombined, LayoutDashboard, Package, ReceiptText, Store } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { DashboardBrand } from '../dashboard/DashboardCommon';

const links = [
  { to: '/admin', end: true, label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/admin/products', label: 'Sản phẩm', icon: Package },
  { to: '/admin/orders', label: 'Đơn hàng', icon: ReceiptText },
  { to: '/admin/monitoring', label: 'Giám sát hệ thống', icon: ChartNoAxesCombined },
];

export function AdminSidebar() {
  return (
    <aside className="dash-sidebar">
      <DashboardBrand />
      <nav className="dash-nav" aria-label="Điều hướng quản trị demo">
        {links.map(({ to, end, label, icon: Icon }) => (
          <NavLink to={to} end={end} key={to}><Icon size={18} aria-hidden="true" /><span>{label}</span></NavLink>
        ))}
      </nav>
      <div className="dash-sidebar-footer">
        <Link className="button button-secondary dash-home" to="/"><Store size={16} /> Về trang Demo</Link>
        <div className="dash-account">
          <span className="dash-avatar" aria-hidden="true">AD</span>
          <div><strong>Quản trị viên demo</strong><small>FLASHRUSH Store</small></div>
        </div>
      </div>
    </aside>
  );
}
