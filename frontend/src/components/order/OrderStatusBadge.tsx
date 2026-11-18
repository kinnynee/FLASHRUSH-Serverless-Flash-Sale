import type { OrderStatus } from '../../types/order';
const labels: Record<OrderStatus, string> = { PENDING: 'Đang chờ xác nhận', CONFIRMED: 'Đã xác nhận', OUT_OF_STOCK: 'Hết hàng', FAILED: 'Xử lý thất bại' };
export function OrderStatusBadge({ status }: { status: OrderStatus }) { return <span className={`order-badge order-badge-${status.toLowerCase()}`}>● {labels[status]}</span>; }
