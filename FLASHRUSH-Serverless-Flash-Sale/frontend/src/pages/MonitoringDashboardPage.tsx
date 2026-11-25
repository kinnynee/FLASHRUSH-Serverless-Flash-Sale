import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminSidebar } from "../components/admin/AdminSidebar";
import { AdminTopbar } from "../components/admin/AdminTopbar";
import { Button } from "../components/common/Button";
import { getAdminKey } from "../services/adminAuth";
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
      <small>
        {point
          ? `Quan sát: ${time(point.at)}`
          : "CloudWatch chưa trả về datapoint."}
      </small>
    </div>
  );
}

export function MonitoringDashboardPage() {
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
      if (!getAdminKey()) {
        setSnapshot(undefined);
        setLoading(false);
        setError("Nhập Admin API key và bấm Kết nối để đọc số liệu AWS.");
        return;
      }
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
      <AdminTopbar
        onConnect={() => {
          setSnapshot(undefined);
          refresh();
        }}
      />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="dash-admin-main">
          <header className="dash-admin-header dash-heading dash-monitor-heading">
            <div>
              <h1>Giám sát hệ thống</h1>
              <p>Amazon CloudWatch · số liệu thực từ AWS</p>
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
                Tự cập nhật mỗi phút
              </label>
              <Button variant="secondary" onClick={refresh} disabled={loading}>
                <RefreshCw size={16} />
                {loading ? "Đang đọc AWS..." : "Làm mới"}
              </Button>
            </div>
          </header>
          <div className="dash-admin-body dash-stack" aria-busy={loading}>
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
                <section className="dash-card monitoring-source">
                  <strong>CloudWatch · {snapshot.region}</strong>
                  <p>
                    Cửa sổ: {time(snapshot.window.start)} –{" "}
                    {time(snapshot.window.end)} · chu kỳ 60 giây
                  </p>
                  <p>
                    Cập nhật: {time(snapshot.updatedAt)}. Số liệu AWS có thể
                    xuất hiện trễ vài phút; thiếu dữ liệu không đồng nghĩa với 0
                    hay hệ thống khỏe mạnh.
                  </p>
                </section>
                <section className="dash-card dash-telemetry">
                  <h2>Amazon SQS</h2>
                  <p>
                    {snapshot.queues.name} · DLQ: {snapshot.queues.dlqName}
                  </p>
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
                      title="Tuổi tin nhắn lâu nhất"
                      point={snapshot.queues.oldestAge}
                      unit="giây"
                    />
                    <QueueMetric
                      title="Tin nhắn DLQ"
                      point={snapshot.queues.dlqVisible}
                    />
                  </dl>
                  <small>
                    Giá trị xấp xỉ, lấy datapoint gần nhất trong khoảng đã chọn
                    (Maximum mỗi phút).
                  </small>
                  <div className="monitoring-charts-grid">
                    <MonitoringChart
                      snapshot={snapshot}
                      title="SQS và DLQ theo thời gian"
                      config={queueChartConfig}
                      unit="Tin nhắn"
                    />
                    <MonitoringChart
                      snapshot={snapshot}
                      title="Thời gian chờ trong hàng đợi"
                      config={queueAgeConfig}
                      unit="Giây"
                    />
                  </div>
                </section>
                <div className="dash-monitor-grid">
                  {snapshot.functions.map((fn, index) => (
                    <section className="dash-card dash-telemetry" key={fn.name}>
                      <h2>AWS Lambda</h2>
                      <p>{fn.name}</p>
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
                  <h2>CloudWatch Alarms</h2>
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
                <section className="dash-card">
                  <h2>Số liệu theo phút</h2>
                  <p>Chỉ hiển thị datapoint CloudWatch đã trả về.</p>
                  <div className="monitoring-series">
                    {Object.entries(snapshot.series).map(([name, points]) => (
                      <details key={name}>
                        <summary>
                          {name} · {points.length} điểm dữ liệu
                        </summary>
                        {points.length ? (
                          <table>
                            <thead>
                              <tr>
                                <th>Thời điểm</th>
                                <th>Giá trị</th>
                              </tr>
                            </thead>
                            <tbody>
                              {points.map((point) => (
                                <tr key={point.at}>
                                  <td>{time(point.at)}</td>
                                  <td>{number(point.value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p>Chưa có dữ liệu trong khoảng này.</p>
                        )}
                      </details>
                    ))}
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
