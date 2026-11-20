import { NavLink } from 'react-router-dom';
export function Navbar() {
  return <nav className="navbar" aria-label="Điều hướng chính"><NavLink to="/products">Sản phẩm Flash Sale</NavLink><NavLink to="/orders">Đơn hàng của tôi</NavLink><NavLink to="/admin">Quản trị hệ thống</NavLink></nav>;
}
