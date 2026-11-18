import { Link } from 'react-router-dom';
import type { OrderStatus } from '../../types/order';
export function OrderResultActions({ status, onRefresh }: { status: OrderStatus; onRefresh(): void }) {
  return <div className="order-actions">{status === 'FAILED' ? <><button className="button button-primary" onClick={onRefresh}>Xem trạng thái đơn</button><Link className="button order-outline" to="/">Về trang chủ</Link></> : <><Link className="button button-primary" to={status === 'OUT_OF_STOCK' ? '/products' : '/orders'}>{status === 'OUT_OF_STOCK' ? 'Xem sản phẩm khác' : 'Xem đơn hàng'}</Link><Link className="button order-outline" to={status === 'OUT_OF_STOCK' ? '/orders' : '/products'}>{status === 'OUT_OF_STOCK' ? 'Xem đơn hàng' : 'Tiếp tục xem sản phẩm'}</Link></>}</div>;
}
