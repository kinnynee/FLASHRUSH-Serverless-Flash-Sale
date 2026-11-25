import { useEffect, useState } from "react";
import { orderService } from "../services/orderService";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { Button } from "../components/common/Button";
import { isTerminal } from "../types/order";
import type { OrderRecord } from "../types/order";
import { Link } from "react-router-dom";
import { OrderStatusBadge } from "../components/order/OrderStatusBadge";
import { OrderSummary } from "../components/order/OrderSummary";
import {
  getAccess,
  getHistory,
  getIntent,
  saveHistory,
} from "../services/orderStorage";
import type { OrderStatus } from "../types/order";
const filters: { label: string; value: OrderStatus | "ALL" }[] = [
  { label: "Tất cả", value: "ALL" },
  { label: "Đang chờ", value: "PENDING" },
  { label: "Đã xác nhận", value: "CONFIRMED" },
  { label: "Hết hàng", value: "OUT_OF_STOCK" },
  { label: "Thất bại", value: "FAILED" },
];
export function OrderHistoryPage() {
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [synced, setSynced] = useState<string[]>([]);
  const [lastChecked, setLastChecked] = useState<number>();
  const access = getAccess();
  const pendingIntent = getIntent();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSynced([]);
    async function load() {
      try {
        const local = getHistory(),
          keys = getAccess();
        const results = await Promise.allSettled(
          local.map((order) =>
            keys[order.orderId]
              ? orderService.getOrder(order.orderId, keys[order.orderId])
              : Promise.resolve(order),
          ),
        );
        if (!active) return;
        setSynced(
          results.flatMap((result, index) =>
            result.status === "fulfilled" && keys[local[index].orderId]
              ? [local[index].orderId]
              : [],
          ),
        );
        setLastChecked(Date.now());
        setOrders(
          results.map((result, index) =>
            result.status === "fulfilled" ? result.value : local[index],
          ),
        );
        for (const result of results) {
          if (result.status === "fulfilled") {
            try {
              saveHistory(result.value);
            } catch {
              setError("Không thể lưu trạng thái mới trên trình duyệt.");
            }
          }
        }
        if (results.some((result) => result.status === "rejected"))
          setError(
            "Chưa cập nhật được một số đơn. Vui lòng thử lại; thông tin đã lưu vẫn được giữ nguyên.",
          );
      } catch {
        if (active) setError("Không thể đọc lịch sử trên trình duyệt.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [attempt]);
  if (loading && orders.length === 0)
    return (
      <div className="container page-state">
        <LoadingSkeleton count={2} />
      </div>
    );
  const shown = orders.filter(
    (o) =>
      (filter === "ALL" ||
        o.status === filter ||
        (filter === "PENDING" && o.status === "PROCESSING")) &&
      `${o.orderId} ${o.item.name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="container order-history">
      <section className="order-panel history-title">
        <h1>Đơn hàng của tôi</h1>
        <p>
          Lịch sử trên trình duyệt này. Mở chi tiết đơn để tự động theo dõi tiến
          trình.
        </p>
        <p>
          {orders.length} yêu cầu ·{" "}
          {orders.filter((o) => o.status === "CONFIRMED").length} xác nhận gần
          nhất
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          {loading ? "Đang cập nhật..." : "Cập nhật trạng thái"}
        </Button>
        {lastChecked && (
          <p>
            Lần kiểm tra gần nhất:{" "}
            {new Date(lastChecked).toLocaleTimeString("vi-VN")}
          </p>
        )}
      </section>
      {error && (
        <p className="order-error" role="alert">
          {error}
        </p>
      )}
      {pendingIntent && (
        <div className="order-notice">
          Có yêu cầu chưa xác định kết quả.{" "}
          <Link className="text-link" to="/checkout">
            Tiếp tục yêu cầu đã lưu
          </Link>
        </div>
      )}
      <div className="order-panel history-filters">
        <div>
          {filters.map((f) => (
            <button
              key={f.value}
              className={filter === f.value ? "selected" : ""}
              onClick={() => setFilter(f.value)}
            >
              {f.label} (
              {f.value === "ALL"
                ? orders.length
                : orders.filter(
                    (o) =>
                      o.status === f.value ||
                      (f.value === "PENDING" && o.status === "PROCESSING"),
                  ).length}
              )
            </button>
          ))}
        </div>
        <input
          aria-label="Tìm theo mã đơn hoặc tên sản phẩm"
          placeholder="Tìm theo mã đơn hoặc tên sản phẩm..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {shown.length === 0 && (
        <section className="order-panel">Chưa có đơn hàng phù hợp.</section>
      )}
      {shown.map((order) => (
        <section className="order-panel history-card" key={order.orderId}>
          <div className="history-card-head">
            <strong>{order.orderId}</strong>
            <time>{new Date(order.createdAt).toLocaleString("vi-VN")}</time>
            {access[order.orderId] ? (
              <OrderStatusBadge status={order.status} />
            ) : (
              <span className="order-badge">Không thể xác minh</span>
            )}
          </div>
          <OrderSummary item={order.item} />
          <div className="history-card-footer">
            <span>
              {synced.includes(order.orderId)
                ? "Đã đồng bộ trạng thái đơn hàng"
                : access[order.orderId]
                  ? "Trạng thái đã lưu; chưa xác minh trong lần cập nhật này."
                  : "Phiên truy cập đã hết; không thể kiểm tra trạng thái hiện tại."}
            </span>
            <Link
              className="button order-outline"
              to={`/orders/${encodeURIComponent(order.orderId)}/${access[order.orderId] && isTerminal(order.status) ? "result" : "processing"}`}
            >
              {isTerminal(order.status) ? "Xem kết quả" : "Theo dõi tiến trình"}
            </Link>
          </div>
        </section>
      ))}
    </div>
  );
}
