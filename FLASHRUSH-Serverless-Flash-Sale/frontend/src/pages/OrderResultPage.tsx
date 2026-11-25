import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { OrderStatusIcon } from '../components/order/OrderStatusIcon';
import { OrderResultActions } from '../components/order/OrderResultActions';
import { OrderSummary } from '../components/order/OrderSummary';
import { useOrderPolling } from '../hooks/useOrderPolling';
import { isTerminal } from '../types/order';

const resultCopy = {
  CONFIRMED: { title: 'Đặt hàng thành công!', description: 'Đơn hàng của bạn đã được xác nhận.' },
  OUT_OF_STOCK: { title: 'Không đủ hàng', description: 'Một hoặc nhiều sản phẩm không còn đủ số lượng bạn đã chọn. Hãy kiểm tra lại giỏ hàng.' },
  FAILED: { title: 'Chưa thể hoàn tất đơn hàng', description: 'Bạn có thể xem lại giỏ hàng rồi đặt lại.' },
};

export function OrderResultPage() {
  const { orderId = '' } = useParams();
  const { order, hasAccess, error, refresh, checking } = useOrderPolling(orderId);

  if (order && !isTerminal(order.status)) return <Navigate to={`/orders/${encodeURIComponent(orderId)}/processing`} replace />;
  const result = order && isTerminal(order.status) ? resultCopy[order.status] : undefined;

  return <div className="order-center"><section className="order-panel order-state">
    {!hasAccess ? <>
      <h1>Không thể theo dõi đơn hàng</h1>
      <p>Bạn có thể xem thông tin đã lưu trong Đơn hàng của tôi.</p>
      <Link className="button button-primary" to="/orders">Đơn hàng của tôi</Link>
    </> : order && result ? <>
      <OrderStatusIcon status={order.status} />
      <h1>{result.title}</h1>
      <p>{result.description}</p>
      <OrderSummary {...order} />
      <OrderResultActions status={order.status} />
    </> : <>
      <h1>Kiểm tra đơn hàng</h1>
      {!error && <p role="status">Đang tải trạng thái đơn hàng…</p>}
    </>}
    {hasAccess && error && <div className="order-error" role="alert">
      <p>{error}</p>
      <Button variant="secondary" disabled={checking} onClick={() => void refresh()}>Thử lại</Button>
    </div>}
  </section></div>;
}
