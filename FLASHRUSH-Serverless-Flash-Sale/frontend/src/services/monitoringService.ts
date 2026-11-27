import { adminHeaders } from "./adminAuth";

export interface MetricPoint {
  at: string;
  value: number;
}
export interface MonitoringSnapshot {
  source: "CLOUDWATCH";
  region: string;
  updatedAt: string;
  window: {
    start: string;
    end: string;
    minutes: number;
    periodSeconds: number;
  };
  functions: {
    name: string;
    invocations: number | null;
    errors: number | null;
    throttles: number | null;
    averageDurationMs: number | null;
    maxConcurrency: number | null;
    errorRate: number | null;
  }[];
  queues: {
    name: string;
    dlqName: string;
    visible: MetricPoint | null;
    inFlight: MetricPoint | null;
    oldestAge: MetricPoint | null;
    dlqVisible: MetricPoint | null;
  };
  series: Record<string, MetricPoint[]>;
  alarms: {
    name: string;
    state: "OK" | "ALARM" | "INSUFFICIENT_DATA";
    reason: string;
    updatedAt: string;
  }[];
}

export function parseMonitoring(value: unknown): MonitoringSnapshot {
  const data = value as MonitoringSnapshot;
  const date = (value: unknown) =>
    typeof value === "string" && Number.isFinite(Date.parse(value));
  const metric = (value: unknown) =>
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0);
  const point = (value: MetricPoint) =>
    value && date(value.at) && value.value !== null && metric(value.value);
  if (
    !data ||
    data.source !== "CLOUDWATCH" ||
    typeof data.region !== "string" ||
    !date(data.updatedAt) ||
    !data.window ||
    !date(data.window.start) ||
    !date(data.window.end) ||
    ![15, 60, 180].includes(data.window.minutes) ||
    data.window.periodSeconds !== 60 ||
    !Array.isArray(data.functions) ||
    data.functions.length !== 2 ||
    data.functions.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        ![
          item.invocations,
          item.errors,
          item.throttles,
          item.averageDurationMs,
          item.maxConcurrency,
          item.errorRate,
        ].every(metric),
    ) ||
    !data.queues ||
    typeof data.queues.name !== "string" ||
    typeof data.queues.dlqName !== "string" ||
    ![
      data.queues.visible,
      data.queues.inFlight,
      data.queues.oldestAge,
      data.queues.dlqVisible,
    ].every((item) => item === null || point(item)) ||
    !data.series ||
    typeof data.series !== "object" ||
    Object.values(data.series).some(
      (points) => !Array.isArray(points) || !points.every(point),
    ) ||
    !Array.isArray(data.alarms) ||
    data.alarms.some(
      (item) =>
        !item ||
        typeof item.name !== "string" ||
        typeof item.reason !== "string" ||
        !date(item.updatedAt) ||
        !["OK", "ALARM", "INSUFFICIENT_DATA"].includes(item.state),
    )
  ) {
    throw new Error("Dữ liệu CloudWatch trả về không hợp lệ.");
  }
  return data;
}

export async function getMonitoring(
  minutes: number,
  signal: AbortSignal,
): Promise<MonitoringSnapshot> {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error("Chưa cấu hình API giám sát AWS.");
  const response = await fetch(
    `${base.replace(/\/$/, "")}/admin/monitoring?minutes=${minutes}`,
    {
      headers: adminHeaders(),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    },
  );
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("Nhập Admin API key hợp lệ để xem số liệu CloudWatch.");
    throw new Error(
      `Chưa đọc được CloudWatch (HTTP ${response.status}). Vui lòng thử lại.`,
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("API giám sát trả về sai định dạng. Kiểm tra proxy /api và khởi động lại server local.");
  }
  return parseMonitoring(await response.json());
}
