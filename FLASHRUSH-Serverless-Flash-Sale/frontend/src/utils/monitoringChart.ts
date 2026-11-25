import type { MonitoringSnapshot } from "../services/monitoringService";

export function monitoringChartRows(
  snapshot: MonitoringSnapshot,
  keys: string[],
) {
  const start = Date.parse(snapshot.window.start);
  const end = Date.parse(snapshot.window.end);
  const period = snapshot.window.periodSeconds * 1000;
  const series = Object.fromEntries(
    keys.map((key) => [
      key,
      new Map(
        (snapshot.series[key] ?? []).map((point) => [
          Date.parse(point.at),
          point.value,
        ]),
      ),
    ]),
  );
  // Explicit null buckets keep missing CloudWatch minutes from becoming a continuous line.
  return Array.from(
    { length: Math.ceil((end - start) / period) },
    (_, index) => {
      const timestamp = start + index * period;
      const row: Record<string, number | null> & { timestamp: number } = {
        timestamp,
      };
      for (const key of keys) row[key] = series[key].get(timestamp) ?? null;
      return row;
    },
  );
}
