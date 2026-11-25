import { isTerminal, type OrderStatus } from "../../types/order";

export function OrderProgress({
  status,
  createdAt,
  lastChecked,
}: {
  status: OrderStatus;
  createdAt: number;
  lastChecked?: number;
}) {
  const terminal = isTerminal(status);
  const current = terminal ? 2 : 1;
  const outcome =
    status === "CONFIRMED"
      ? "Đã xác nhận"
      : status === "OUT_OF_STOCK"
        ? "Hết hàng"
        : status === "FAILED"
          ? "Xử lý thất bại"
          : "Chờ kết quả";
  const steps = [
    "Đã tiếp nhận",
    status === "PENDING" ? "Chờ xử lý" : "Xử lý yêu cầu",
    outcome,
  ];
  return (
    <section className="order-progress" aria-label="Tiến trình đơn hàng">
      <ol>
        {steps.map((label, index) => (
          <li
            key={index}
            className={`${index < current ? "complete" : ""} ${index === current ? "current" : ""} ${index === 2 && terminal && status !== "CONFIRMED" ? "unsuccessful" : ""}`}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="progress-marker" aria-hidden="true">
              {index + 1}
            </span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      <p>
        Tiếp nhận:{" "}
        <time dateTime={new Date(createdAt).toISOString()}>
          {new Date(createdAt).toLocaleString("vi-VN")}
        </time>
      </p>
      {lastChecked && (
        <p>
          Cập nhật gần nhất:{" "}
          <time dateTime={new Date(lastChecked).toISOString()}>
            {new Date(lastChecked).toLocaleTimeString("vi-VN")}
          </time>
        </p>
      )}
    </section>
  );
}
