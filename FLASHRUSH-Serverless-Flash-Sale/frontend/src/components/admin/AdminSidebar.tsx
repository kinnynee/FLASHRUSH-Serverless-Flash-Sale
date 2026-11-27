import {
  CalendarClock,
  Package,
  ReceiptText,
  Store,
  Users,
  Warehouse,
  ShieldCheck,
  Ticket,
  Activity,
  LayoutDashboard,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";

const links = [
  { to: "/admin/vouchers", label: "Voucher", icon: Ticket },
  { to: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/admin/monitoring", label: "Giám sát", icon: Activity },
  { to: "/admin/customers", label: "Khách hàng", icon: Users },
  { to: "/admin/inventory", label: "Tồn kho", icon: Warehouse },
  { to: "/admin/users", label: "Nhân viên", icon: ShieldCheck },
  { to: "/admin/products", label: "Sản phẩm", icon: Package },
  { to: "/admin/campaigns", label: "Chiến dịch", icon: CalendarClock },
  { to: "/admin/orders", label: "Đơn hàng", icon: ReceiptText },
];

export function AdminSidebar() {
  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Điều hướng quản trị">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink to={to} key={to} end={to === "/admin"}>
            {({ isActive }) => <><Icon size={18} strokeWidth={isActive ? 2.5 : 2.2} aria-hidden="true" /><span>{label}</span></>}
          </NavLink>
        ))}
      </nav>
      <div className="dash-sidebar-footer">
        <Link className="button button-secondary dash-home" to="/">
          <Store size={16} /> Về cửa hàng
        </Link>
        <div className="dash-account">
          <span className="dash-avatar" aria-hidden="true">
            AD
          </span>
          <div>
            <strong>Quản trị viên</strong>
            <small>FLASHRUSH Store</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
