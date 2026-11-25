import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { OrderStatusIcon } from '../components/order/OrderStatusIcon';
import { OrderSummary } from '../components/order/OrderSummary';
import { useOrderPolling } from '../hooks/useOrderPolling';
import { isTerminal } from '../types/order';

export function OrderProcessingPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { order, error, checking, waiting, hasAccess, refresh } = useOrderPolling(orderId);
  const pending = order && !isTerminal(order.status) ? order : undefined;

  useEffect(() => {
    if (hasAccess && order && isTerminal(order.status)) {
      navigate(`/orders/${encodeURIComponent(orderId)}/result`, { replace: true });
    }
  }, [order, orderId, navigate, hasAccess]);

  return <div className="order-center">
    <section className="order-panel order-state">
      {hasAccess ? <>
        <OrderStatusIcon status="PENDING" />
        <h1>{pending ? 'Đang xác nhận đơn hàng' : 'Kiểm tra đơn hàng'}</h1>
        <p role="status">{pending
          ? waiting ? 'Đơn vẫn đang chờ xác nhận. Bạn có thể quay lại từ Đơn hàng của tôi.' : 'Đã nhận đơn. Chúng tôi đang kiểm tra hàng cho bạn.'
          : error ? 'Chưa thể tải trạng thái đơn hàng.' : 'Đang tải trạng thái đơn hàng…'}</p>
        {pending && <OrderSummary {...pending} />}
        {error && <p className="order-error" role="alert">{error}</p>}
        <div className="order-actions">
          <Link className="button button-primary" to="/orders">Đơn hàng của tôi</Link>
          <Button variant="secondary" disabled={checking} onClick={() => void refresh()}>
            {checking ? 'Đang kiểm tra…' : 'Cập nhật trạng thái'}
          </Button>
        </div>
      </> : <>
        <h1>Không thể theo dõi đơn hàng</h1>
        <p>Bạn có thể xem thông tin đã lưu trong Đơn hàng của tôi.</p>
        <Link className="button button-primary" to="/orders">Đơn hàng của tôi</Link>
      </>}
    </section>
  </div>;
}
