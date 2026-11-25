import { Link } from 'react-router-dom';
import type { OrderStatus } from '../../types/order';

export function OrderResultActions({ status }: { status: OrderStatus }) {
  const confirmed = status === 'CONFIRMED';
  return <div className="order-actions">
    <Link className="button button-primary" to={confirmed ? '/orders' : '/cart'}>
      {confirmed ? 'Đơn hàng của tôi' : 'Về giỏ hàng'}
    </Link>
    <Link className="button order-outline" to="/products">Tiếp tục mua sắm</Link>
  </div>;
}
