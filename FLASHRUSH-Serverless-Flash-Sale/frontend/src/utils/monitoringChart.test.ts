import { describe, expect, it } from "vitest";
import { monitoringChartRows } from "./monitoringChart";
import type { MonitoringSnapshot } from "../services/monitoringService";

describe("CloudWatch chart alignment", () => {
  const snapshot = {
    window: {
      start: "2026-11-25T07:00:00Z",
      end: "2026-11-25T07:03:00Z",
      periodSeconds: 60,
    },
    series: {
      queue_visible: [
        { at: "2026-11-25T14:02:00+07:00", value: 5 },
        { at: "2026-11-25T07:00:00Z", value: 0 },
      ],
      queue_inflight: [{ at: "2026-11-25T07:01:00Z", value: 2 }],
    },
  } as unknown as MonitoringSnapshot;
  it("aligns offset timestamps, preserves zero and leaves missing minutes null", () => {
    const rows = monitoringChartRows(snapshot, [
      "queue_visible",
      "queue_inflight",
    ]);
    expect(rows.map((row) => row.queue_visible)).toEqual([0, null, 5]);
    expect(rows.map((row) => row.queue_inflight)).toEqual([null, 2, null]);
    expect(rows.map((row) => row.timestamp)).toEqual([
      Date.parse(snapshot.window.start),
      Date.parse(snapshot.window.start) + 60000,
      Date.parse(snapshot.window.start) + 120000,
    ]);
  });
  it("keeps unavailable series empty without synthetic zero samples", () => {
    expect(
      monitoringChartRows(snapshot, ["worker_errors"]).every(
        (row) => row.worker_errors === null,
      ),
    ).toBe(true);
  });
});
