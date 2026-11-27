import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";
import type { MonitoringSnapshot } from "../../services/monitoringService";
import { monitoringChartRows } from "../../utils/monitoringChart";

const clock = (value: number) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function MonitoringChart({
  snapshot,
  title,
  config,
  unit,
}: {
  snapshot: MonitoringSnapshot;
  title: string;
  config: ChartConfig;
  unit: string;
}) {
  const rows = useMemo(
    () => monitoringChartRows(snapshot, Object.keys(config)),
    [snapshot, config],
  );
  const hasData = rows.some((row) =>
    Object.keys(config).some((key) => row[key] !== null),
  );
  return (
    <section className="monitoring-chart-panel" aria-label={title}>
      <div className="monitoring-chart-heading">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      {hasData ? (
        <ChartContainer
          config={config}
          className="monitoring-chart"
          role="group"
          aria-label={`${title}, ${snapshot.window.minutes} phút gần nhất. Chi tiết trong bảng số liệu theo phút.`}
        >
          <LineChart
            accessibilityLayer
            data={rows}
            margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[
                Date.parse(snapshot.window.start),
                Date.parse(snapshot.window.end),
              ]}
              scale="time"
              tickFormatter={clock}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickMargin={10}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={38}
              domain={[0, (max: number) => Math.max(1, max)]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="monitoring-chart-tooltip"
                  labelFormatter={(_label, payload) =>
                    new Date(
                      Number(payload[0]?.payload.timestamp),
                    ).toLocaleString("vi-VN")
                  }
                />
              }
            />
            <ChartLegend
              content={
                <ChartLegendContent className="monitoring-chart-legend" />
              }
            />
            {Object.entries(config).map(([key]) => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={2}
              dot={{ r: 2, strokeWidth: 0, fill: `var(--color-${key})` }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      ) : (
        <div className="monitoring-chart-empty">
          <strong>Chưa có dữ liệu trong khoảng này</strong>
          <p>Biểu đồ sẽ xuất hiện khi CloudWatch trả về số liệu.</p>
        </div>
      )}

    </section>
  );
}

export const queueChartConfig = {
  queue_visible: { label: "Đang chờ", color: "#2563eb" },
  queue_inflight: { label: "Đang xử lý", color: "#0d9488" },
  dlq_visible: { label: "DLQ", color: "#e11d48" },
} satisfies ChartConfig;
export const queueAgeConfig = {
  queue_age: { label: "Thời gian chờ", color: "#d97706" },
} satisfies ChartConfig;

export function LambdaChart({
  snapshot,
  prefix,
}: {
  snapshot: MonitoringSnapshot;
  prefix: "api" | "worker";
}) {
  const [mode, setMode] = useState("activity");
  const config = useMemo<ChartConfig>(
    () =>
      mode === "activity"
        ? {
            [`${prefix}_invocations`]: { label: "Thực thi", color: "#2563eb" },
            [`${prefix}_errors`]: { label: "Lỗi", color: "#e11d48" },
            [`${prefix}_throttles`]: { label: "Throttles", color: "#d97706" },
          }
        : {
            [`${prefix}_concurrency`]: {
              label: "Concurrency",
              color: "#0d9488",
            },
          },
    [mode, prefix],
  );
  return (
    <>
      <label className="monitoring-chart-select">
        Chỉ số biểu đồ{" "}
        <select
          aria-label={`Chỉ số Lambda ${prefix}`}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="activity">Thực thi, lỗi và throttles</option>
          <option value="concurrency">Concurrency cao nhất mỗi phút</option>
        </select>
      </label>
      <MonitoringChart
        snapshot={snapshot}
        title={`Lambda ${prefix === "api" ? "API" : "Worker"} theo thời gian`}
        config={config}
        unit={mode === "activity" ? "Lượt" : "Thực thi đồng thời"}
      />
    </>
  );
}
