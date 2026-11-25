import { ShoppingCart } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { totalQuantity } from '../../services/cartStorage';

export function Navbar() {
  const quantity = totalQuantity(useCart().items);
  return <nav className="navbar" aria-label="Điều hướng chính">
    <NavLink to="/products">Sản phẩm Flash Sale</NavLink>
    <NavLink className="cart-nav" to="/cart" aria-label={`Giỏ hàng, ${quantity} sản phẩm`}>
      <ShoppingCart size={17} aria-hidden="true" /> Giỏ hàng <span className="cart-count" aria-hidden="true">{quantity}</span>
    </NavLink>
    <NavLink to="/orders">Đơn hàng của tôi</NavLink>
    <NavLink to="/admin">Quản trị hệ thống</NavLink>
  </nav>;
}
