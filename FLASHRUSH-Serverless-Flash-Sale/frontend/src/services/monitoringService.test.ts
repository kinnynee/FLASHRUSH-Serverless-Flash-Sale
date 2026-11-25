import { describe, expect, it } from "vitest";
import { parseMonitoring } from "./monitoringService";

const fixture = () => ({
  source: "CLOUDWATCH",
  region: "us-east-1",
  updatedAt: "2026-11-25T12:00:00Z",
  window: {
    start: "2026-11-25T11:00:00Z",
    end: "2026-11-25T12:00:00Z",
    minutes: 60,
    periodSeconds: 60,
  },
  functions: ["api", "worker"].map((name) => ({
    name,
    invocations: null,
    errors: null,
    throttles: null,
    averageDurationMs: null,
    maxConcurrency: null,
    errorRate: null,
  })),
  queues: {
    name: "orders",
    dlqName: "dlq",
    visible: null,
    inFlight: null,
    oldestAge: null,
    dlqVisible: null,
  },
  series: { api_invocations: [] },
  alarms: [],
});
describe("CloudWatch contract", () => {
  it("preserves unknown metrics instead of converting them to zero", () => {
    expect(parseMonitoring(fixture()).functions[0].invocations).toBeNull();
    expect(parseMonitoring(fixture()).queues.visible).toBeNull();
  });
  it("rejects mock and malformed payloads", () => {
    expect(() => parseMonitoring({ ...fixture(), source: "MOCK" })).toThrow();
    expect(() => parseMonitoring({ ...fixture(), functions: [] })).toThrow();
    expect(() =>
      parseMonitoring({
        ...fixture(),
        series: { broken: [{ at: "bad", value: 0 }] },
      }),
    ).toThrow();
    expect(() => parseMonitoring({ ...fixture(), queues: {} })).toThrow();
  });
  it("keeps a measured zero", () => {
    const data = fixture();
    const snapshot = {
      ...data,
      queues: { ...data.queues, visible: { at: data.updatedAt, value: 0 } },
    };
    expect(parseMonitoring(snapshot).queues.visible?.value).toBe(0);
  });
});
