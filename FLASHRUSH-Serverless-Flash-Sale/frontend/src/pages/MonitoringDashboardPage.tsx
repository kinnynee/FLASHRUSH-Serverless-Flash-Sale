import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminSidebar } from "../components/admin/AdminSidebar";
import { AdminTopbar } from "../components/admin/AdminTopbar";
import { AdminApiKeyControl } from "../components/admin/AdminApiKeyControl";

import { Button } from "../components/common/Button";
import {
  LambdaChart,
  MonitoringChart,
  queueChartConfig,
  queueAgeConfig,
} from "../components/monitoring/MonitoringChart";
import {
  getMonitoring,
  type MetricPoint,
  type MonitoringSnapshot,
} from "../services/monitoringService";

const number = (value: number | null) =>
  value === null
    ? "Chưa có dữ liệu"
    : value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const time = (value: string) => new Date(value).toLocaleString("vi-VN");
const clock = (value: string) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const metricNames: Record<string, string> = {
  api_invocations: "API · Lượt thực thi",
  api_errors: "API · Lỗi",
  api_throttles: "API · Giới hạn",
  api_concurrency: "API · Đồng thời",
  worker_invocations: "Worker · Lượt thực thi",
  worker_errors: "Worker · Lỗi",
  worker_throttles: "Worker · Giới hạn",
  worker_concurrency: "Worker · Đồng thời",
  queue_visible: "Hàng đợi · Đang chờ",
  queue_inflight: "Hàng đợi · Đang xử lý",
  queue_age: "Hàng đợi · Thời gian chờ",
  dlq_visible: "Hàng đợi lỗi",
};

function QueueMetric({
  title,
  point,
  unit = "",
}: {
  title: string;
  point: MetricPoint | null;
  unit?: string;
}) {
  return (
    <div>
      <dt>{title}</dt>
      <dd>
        {number(point?.value ?? null)} {point ? unit : ""}
      </dd>
      <small title={point ? time(point.at) : "Chưa có dữ liệu"}>
        {point ? clock(point.at) : "Chưa có dữ liệu"}
      </small>
    </div>
  );
}

export function MonitoringDashboardPage() {
  const [seriesKey, setSeriesKey] = useState("api_invocations");
  const [minutes, setMinutes] = useState(60);
  const [revision, setRevision] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const next = await getMonitoring(minutes, controller.signal);
        if (active) {
          setSnapshot(next);
          setError("");
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Không thể tải CloudWatch.",
          );
      } finally {
        if (active) {
          setLoading(false);
          if (automatic) timer = setTimeout(tick, 60000);
        }
      }
    }
    function tick() {
      if (!active) return;
      if (document.hidden) {
        timer = setTimeout(tick, 60000);
        return;
      }
      void load();
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [minutes, revision, automatic]);

  return (
    <>
      <AdminTopbar />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="dash-admin-main">
          <header className="dash-admin-header dash-heading dash-monitor-heading">
            <div>
              <h1>Giám sát hệ thống</h1>
            </div>
            <div className="dash-monitor-actions">
              <label className="dash-scenario-select">
                Khoảng thời gian{" "}
                <select
                  value={minutes}
                  onChange={(event) => {
                    setSnapshot(undefined);
                    setMinutes(Number(event.target.value));
                  }}
                >
                  <option value={15}>15 phút</option>
                  <option value={60}>1 giờ</option>
                  <option value={180}>3 giờ</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(event) => setAutomatic(event.target.checked)}
                />{" "}
                Tự cập nhật
              </label>
              <Button variant="secondary" onClick={refresh} disabled={loading}>
                <RefreshCw size={16} />
                {loading ? "Đang tải..." : "Làm mới"}
              </Button>
            </div>
          </header>
          <div
            className="dash-admin-body dash-stack monitoring-body"
            aria-busy={loading}
          >
            <AdminApiKeyControl
              onChange={() => {
                setSnapshot(undefined);
                refresh();
              }}
            />

            {error && (
              <div className="order-error" role="alert">
                {error}
                {snapshot && (
                  <p>
                    Đang hiển thị dữ liệu từ lần cập nhật thành công trước:{" "}
                    {time(snapshot.updatedAt)}.
                  </p>
                )}
              </div>
            )}
            {loading && !snapshot && (
              <p role="status">Đang tải số liệu CloudWatch...</p>
            )}
            {snapshot && (
              <>
                <section
                  className="monitoring-source"
                  aria-label="Trạng thái dữ liệu"
                >
                  <div className="monitoring-source-main">
                    <span className="monitoring-region">{snapshot.region}</span>
                    <span>
                      {clock(snapshot.window.start)} –{" "}
                      {clock(snapshot.window.end)}
                    </span>
                    <span className="monitoring-updated">
                      Cập nhật {clock(snapshot.updatedAt)}
                    </span>
                  </div>
                  <details>
                    <summary>Chi tiết dữ liệu</summary>
                    <p>
                      {time(snapshot.window.start)} –{" "}
                      {time(snapshot.window.end)} · Mỗi phút. Số liệu có thể
                      trễ; thiếu dữ liệu không đồng nghĩa với 0.
                    </p>
                  </details>
                </section>
                <section className="dash-card dash-telemetry">
                  <h2>Hàng đợi</h2>
                  <dl className="dash-metric-grid monitoring-queue-grid">
                    <QueueMetric
                      title="Đang chờ xử lý"
                      point={snapshot.queues.visible}
                    />
                    <QueueMetric
                      title="Đang xử lý"
                      point={snapshot.queues.inFlight}
                    />
                    <QueueMetric
                      title="Chờ lâu nhất"
                      point={snapshot.queues.oldestAge}
                      unit="giây"
                    />
                    <QueueMetric
                      title="Hàng đợi lỗi"
                      point={snapshot.queues.dlqVisible}
                    />
                  </dl>

                  <div className="monitoring-charts-grid">
                    <MonitoringChart
                      snapshot={snapshot}
                      title="Lưu lượng hàng đợi"
                      config={queueChartConfig}
                      unit="Tin nhắn"
                    />
                    <MonitoringChart
                      snapshot={snapshot}
                      title="Thời gian chờ"
                      config={queueAgeConfig}
                      unit="Giây"
                    />
                  </div>
                </section>
                <div className="dash-monitor-grid">
                  {snapshot.functions.map((fn, index) => (
                    <section className="dash-card dash-telemetry" key={fn.name}>
                      <h2 title={fn.name}>{index === 0 ? "API" : "Worker"}</h2>
                      <dl className="dash-metric-grid">
                        <div>
                          <dt>Lượt thực thi</dt>
                          <dd>{number(fn.invocations)}</dd>
                          <small>Tổng trong cửa sổ</small>
                        </div>
                        <div>
                          <dt>Lỗi</dt>
                          <dd>{number(fn.errors)}</dd>
                          <small>
                            Tỷ lệ:{" "}
                            {fn.errorRate === null
                              ? "Chưa xác định"
                              : `${number(fn.errorRate)}%`}
                          </small>
                        </div>
                        <div>
                          <dt>Throttles</dt>
                          <dd>{number(fn.throttles)}</dd>
                        </div>
                        <div>
                          <dt>Thời gian trung bình</dt>
                          <dd>
                            {number(fn.averageDurationMs)}{" "}
                            {fn.averageDurationMs !== null && "ms"}
                          </dd>
                        </div>
                        <div>
                          <dt>Concurrency cao nhất</dt>
                          <dd>{number(fn.maxConcurrency)}</dd>
                        </div>
                      </dl>
                      <LambdaChart
                        snapshot={snapshot}
                        prefix={index === 0 ? "api" : "worker"}
                      />
                    </section>
                  ))}
                </div>
                <section className="dash-card">
                  <h2>Cảnh báo</h2>
                  {snapshot.alarms.length === 0 ? (
                    <p>
                      Chưa tìm thấy alarm đã cấu hình. Không thể kết luận hệ
                      thống không có cảnh báo.
                    </p>
                  ) : (
                    <ul className="dash-alert-list">
                      {snapshot.alarms.map((alarm) => (
                        <li
                          key={alarm.name}
                          className={`dash-alert dash-${alarm.state === "ALARM" ? "red" : alarm.state === "OK" ? "green" : "amber"}`}
                        >
                          <strong>{alarm.name}</strong>
                          <span className="dash-tag">{alarm.state}</span>
                          <p>{alarm.reason}</p>
                          <time dateTime={alarm.updatedAt}>
                            {time(alarm.updatedAt)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="dash-card monitoring-data">
                  <div className="monitoring-data-header">
                    <div>
                      <h2>Số liệu chi tiết</h2>
                      <span>
                        {(snapshot.series[seriesKey] || []).length} điểm dữ liệu
                      </span>
                    </div>
                    <label>
                      <span className="sr-only">Chọn chỉ số</span>
                      <select
                        value={seriesKey}
                        onChange={(event) => setSeriesKey(event.target.value)}
                      >
                        {Object.keys(snapshot.series).map((name) => (
                          <option key={name} value={name}>
                            {metricNames[name] || name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="monitoring-data-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Thời gian</th>
                          <th scope="col">Giá trị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(snapshot.series[seriesKey] || []).map((point) => (
                          <tr key={point.at}>
                            <td>{clock(point.at)}</td>
                            <td>{number(point.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!(snapshot.series[seriesKey] || []).length && (
                      <p className="monitoring-data-empty">
                        Chưa có dữ liệu trong khoảng đã chọn.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
