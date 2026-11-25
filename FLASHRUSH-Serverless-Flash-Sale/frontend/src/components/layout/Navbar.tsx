import { NavLink } from 'react-router-dom';
import { useCustomer } from '../customer/CustomerProvider';
export function Navbar() {
  const { user } = useCustomer();
  return <nav className="navbar" aria-label="Điều hướng chính"><NavLink to="/products">Sản phẩm Flash Sale</NavLink><NavLink to={user ? '/account/orders' : '/orders'}>Đơn hàng của tôi</NavLink><NavLink to="/admin">Quản trị hệ thống</NavLink></nav>;
}
