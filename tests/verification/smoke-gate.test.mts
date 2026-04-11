import { describe, it, expect, mock } from "bun:test";
import { runSmokeGate } from "../../src/verification/smoke-gate.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("runSmokeGate", () => {
  it("should return a smoke gate result with gate 'smoke'", async () => {
    const result = await runSmokeGate(
      "/nonexistent-smoke-test-dir",
      39999,
      mockLogger,
    );
    expect(result.gate).toBe("smoke");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.endpointResults)).toBe(true);
  });

  it("should fail when server cannot start", async () => {
    const result = await runSmokeGate(
      "/nonexistent-smoke-test-dir",
      39998,
      mockLogger,
    );
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should include endpoint results array", async () => {
    const result = await runSmokeGate(
      "/nonexistent-smoke-test-dir",
      39997,
      mockLogger,
    );
    expect(Array.isArray(result.endpointResults)).toBe(true);
  });

  it("should accept custom endpoint specs", async () => {
    const result = await runSmokeGate(
      "/nonexistent-smoke-test-dir",
      39996,
      mockLogger,
      [{ method: "GET", path: "/v1/items", expectedStatus: 200 }],
    );
    expect(result.gate).toBe("smoke");
    expect(typeof result.passed).toBe("boolean");
  });

  it("should have durationMs greater than or equal to zero", async () => {
    const result = await runSmokeGate(
      "/nonexistent-smoke-test-dir",
      39995,
      mockLogger,
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
