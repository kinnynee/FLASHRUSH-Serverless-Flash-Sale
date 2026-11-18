import { isMockMode } from '../services/orderService';
import { OrderStatusIcon } from '../components/order/OrderStatusIcon';
import { OrderResultActions } from '../components/order/OrderResultActions';
import { Link, Navigate, useParams } from 'react-router-dom';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import { useOrderPolling } from '../hooks/useOrderPolling';
export function OrderResultPage() {
  const { orderId = '' } = useParams(); const { order, hasAccess, error, refresh, checking } = useOrderPolling(orderId);
  if (!hasAccess) return <div className="order-center"><section className="order-panel order-state"><h1>Không thể xác minh trạng thái</h1><p>Thông tin truy cập chỉ được giữ trong phiên trình duyệt đã tạo đơn.</p><Link className="button button-primary" to="/orders">Về lịch sử đơn hàng</Link></section></div>;
  if (!order) return <div className="order-center"><section className="order-panel order-state"><p>{error || 'Đang tải trạng thái...'}</p><button className="button button-secondary" disabled={checking} onClick={() => void refresh()}>Kiểm tra lại</button></section></div>;
  if (order.status === 'PENDING' || order.status === 'PROCESSING') return <Navigate to={`/orders/${encodeURIComponent(orderId)}/processing`} replace />;
  const confirmed = order.status === 'CONFIRMED'; const out = order.status === 'OUT_OF_STOCK';
  return <div className="order-center"><section className="order-panel order-state"><OrderStatusIcon status={order.status} /><OrderStatusBadge status={order.status} /><h1>{confirmed ? 'Đặt hàng thành công!' : out ? 'Sản phẩm đã hết hàng' : 'Không thể hoàn tất yêu cầu'}</h1><p>{confirmed ? 'Yêu cầu đặt hàng mô phỏng đã được xác nhận.' : out ? 'Số lượng tồn kho mô phỏng không đủ khi xử lý yêu cầu.' : 'Không thể hoàn tất xử lý yêu cầu.'}</p><OrderSummary item={order.item} orderId={order.orderId} /><OrderResultActions status={order.status} onRefresh={() => void refresh()} /><small>{isMockMode ? 'Dữ liệu kết quả mô phỏng theo kịch bản Flash Sale.' : 'Trạng thái được xác minh từ AWS. Không thanh toán hoặc giao hàng thực tế.'}</small></section></div>;
}
