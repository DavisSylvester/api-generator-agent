import { describe, it, expect, mock } from "bun:test";
import { runTestGate, parseTestOutput } from "../../src/verification/test-gate.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("runTestGate", () => {
  it("should return a test gate result with gate 'test'", async () => {
    const result = await runTestGate("/nonexistent-path-test-gate", mockLogger);
    expect(result.gate).toBe("test");
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.passCount).toBe("number");
    expect(typeof result.failCount).toBe("number");
    expect(typeof result.skipCount).toBe("number");
    expect(typeof result.totalCount).toBe("number");
    expect(Array.isArray(result.testDetails)).toBe(true);
  });

  it("should fail when projectDir does not exist", async () => {
    const result = await runTestGate("/no-such-dir-test-gate", mockLogger);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should have durationMs greater than or equal to zero", async () => {
    const result = await runTestGate("/nonexistent-path-test-gate", mockLogger);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("parseTestOutput", () => {
  it("should parse pass count from summary line", () => {
    const output = " 10 pass\n 0 fail\nRan 10 tests across 2 files.";
    const parsed = parseTestOutput(output);
    expect(parsed.passCount).toBe(10);
    expect(parsed.failCount).toBe(0);
  });

  it("should parse fail count from summary line", () => {
    const output = " 8 pass\n 2 fail\nRan 10 tests across 3 files.";
    const parsed = parseTestOutput(output);
    expect(parsed.passCount).toBe(8);
    expect(parsed.failCount).toBe(2);
  });

  it("should parse skip count from summary line", () => {
    const output = " 5 pass\n 1 skip\n 0 fail";
    const parsed = parseTestOutput(output);
    expect(parsed.passCount).toBe(5);
    expect(parsed.skipCount).toBe(1);
    expect(parsed.failCount).toBe(0);
  });

  it("should return zero counts for empty output", () => {
    const parsed = parseTestOutput("");
    expect(parsed.passCount).toBe(0);
    expect(parsed.failCount).toBe(0);
    expect(parsed.skipCount).toBe(0);
    expect(parsed.testDetails).toHaveLength(0);
  });

  it("should parse individual pass test lines", () => {
    const output = "\u2713 should do something\n 1 pass\n 0 fail";
    const parsed = parseTestOutput(output);
    expect(parsed.testDetails.length).toBeGreaterThanOrEqual(1);
    const passingTest = parsed.testDetails.find((t) => t.status === "pass");
    expect(passingTest).toBeDefined();
    expect(passingTest?.name).toContain("should do something");
  });

  it("should parse individual fail test lines", () => {
    const output = "\u2717 should fail gracefully\n 0 pass\n 1 fail";
    const parsed = parseTestOutput(output);
    const failingTest = parsed.testDetails.find((t) => t.status === "fail");
    expect(failingTest).toBeDefined();
    expect(failingTest?.name).toContain("should fail gracefully");
  });

  it("should handle output with durations", () => {
    const output = "\u2713 should be fast [1.23ms]\n 1 pass\n 0 fail";
    const parsed = parseTestOutput(output);
    expect(parsed.passCount).toBe(1);
    const detail = parsed.testDetails.find((t) => t.status === "pass");
    expect(detail?.name).toContain("should be fast");
  });
});
