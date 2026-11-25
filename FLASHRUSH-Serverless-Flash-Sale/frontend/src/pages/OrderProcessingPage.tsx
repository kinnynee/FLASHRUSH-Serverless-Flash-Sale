import { OrderProgress } from "../components/order/OrderProgress";
import { OrderStatusIcon } from "../components/order/OrderStatusIcon";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { OrderStatusBadge } from "../components/order/OrderStatusBadge";
import { OrderSummary } from "../components/order/OrderSummary";
import { useOrderPolling } from "../hooks/useOrderPolling";
import { isTerminal } from "../types/order";
export function OrderProcessingPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { order, error, checking, waiting, lastChecked, hasAccess, refresh } =
    useOrderPolling(orderId);
  useEffect(() => {
    if (hasAccess && order && isTerminal(order.status))
      navigate(`/orders/${encodeURIComponent(orderId)}/result`, {
        replace: true,
      });
  }, [order, orderId, navigate, hasAccess]);
  return (
    <div className="order-center">
      <section className="order-panel order-state">
        {hasAccess ? (
          <>
            {order && !isTerminal(order.status) ? (
              <>
                <OrderStatusBadge status={order.status} />
                <OrderStatusIcon status={order.status} />
                <h1>Đơn hàng đang được xử lý</h1>
                <p>
                  Yêu cầu đặt hàng đã được tiếp nhận vào hệ thống. Kết quả sẽ
                  được cập nhật khi hoàn tất.
                </p>
                <OrderProgress
                  status={order.status}
                  createdAt={order.createdAt}
                  lastChecked={lastChecked}
                />
                <OrderSummary item={order.item} orderId={order.orderId} />
                <p>
                  {waiting
                    ? "Đã tạm dừng tự động cập nhật sau 60 giây. Đơn vẫn đang được xử lý; bấm kiểm tra lại để tiếp tục theo dõi."
                    : "Đang chờ kết quả xác nhận..."}
                </p>
              </>
            ) : (
              <>
                <h1>Kiểm tra trạng thái đơn</h1>
                <p>
                  {waiting
                    ? "Đã tạm dừng tự động cập nhật. Chưa xác minh được kết quả; bấm kiểm tra lại để tiếp tục theo dõi."
                    : error
                    ? "Chưa thể xác minh trạng thái đơn."
                    : "Đang tải trạng thái..."}
                </p>
              </>
            )}
            {error && (
              <p className="order-error" role="alert">
                {error}
              </p>
            )}
            <div className="order-actions">
              <Button
                variant="secondary"
                disabled={checking}
                onClick={() => void refresh()}
              >
                {checking ? "Đang kiểm tra..." : "Kiểm tra lại trạng thái"}
              </Button>
              <Link className="button order-outline" to="/">
                Về trang chủ
              </Link>
            </div>
            <Link className="text-link" to="/orders">
              Theo dõi trong đơn hàng của tôi
            </Link>
          </>
        ) : (
          <>
            <h1>Không thể theo dõi đơn</h1>
            <p>
              Thông tin truy cập của phiên đã không còn. Lịch sử chỉ lưu thông
              tin gần nhất và không thể xác minh trạng thái hiện tại.
            </p>
            <Link className="button button-primary" to="/orders">
              Về lịch sử đơn hàng
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
