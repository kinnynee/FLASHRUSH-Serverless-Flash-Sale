import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import { useOrderPolling } from '../hooks/useOrderPolling';
import { isTerminal } from '../types/order';
export function OrderProcessingPage() {
  const { orderId = '' } = useParams(); const navigate = useNavigate(); const { order, error, checking, waiting, hasAccess, refresh } = useOrderPolling(orderId);
  useEffect(() => { if (hasAccess && order && isTerminal(order.status)) navigate(`/orders/${encodeURIComponent(orderId)}/result`, { replace: true }); }, [order, orderId, navigate, hasAccess]);
  return <div className="order-center"><section className="order-panel order-state"><span className="demo-badge">Dữ liệu mô phỏng</span>{hasAccess ? <>{order?.status === 'PENDING' ? <><OrderStatusBadge status="PENDING" /><div className="order-icon pending">↻</div><h1>Đơn hàng đang được xử lý</h1><p>Yêu cầu đã được tiếp nhận trong bản mô phỏng. Kết quả sẽ được cập nhật khi hoàn tất.</p><OrderSummary item={order.item} orderId={order.orderId} /><p>{waiting ? 'Chưa có kết quả. Bạn có thể kiểm tra lại.' : 'Đang chờ kết quả xác nhận...'}</p></> : <><h1>Kiểm tra trạng thái đơn</h1><p>{error ? 'Chưa thể xác minh trạng thái đơn.' : 'Đang tải trạng thái...'}</p></>}{error && <p className="order-error" role="alert">{error}</p>}<div className="order-actions"><Button variant="secondary" disabled={checking} onClick={() => void refresh()}>{checking ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái'}</Button><Link className="button order-outline" to="/">Về trang chủ</Link></div><small>Tiếp nhận không đồng nghĩa với đặt hàng thành công.</small></> : <><h1>Không thể theo dõi đơn</h1><p>Thông tin truy cập của phiên đã không còn. Lịch sử chỉ lưu thông tin gần nhất và không thể xác minh trạng thái hiện tại.</p><Link className="button button-primary" to="/orders">Về lịch sử đơn hàng</Link></>}</section></div>;
}
