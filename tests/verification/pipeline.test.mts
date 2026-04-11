import { describe, it, expect, mock } from "bun:test";
import { runVerificationPipeline } from "../../src/verification/pipeline.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("runVerificationPipeline", () => {
  it("should return a pipeline result with results array", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39991,
        skipSmoke: true,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.results)).toBe(true);
    expect(Array.isArray(result.gateRuns)).toBe(true);
    expect(typeof result.totalDurationMs).toBe("number");
  });

  it("should include gate run records", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39990,
        skipSmoke: true,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    expect(result.gateRuns.length).toBeGreaterThan(0);
    for (const run of result.gateRuns) {
      expect(typeof run.gate).toBe("string");
      expect(typeof run.attempt).toBe("number");
      expect(run.result).toBeDefined();
    }
  });

  it("should stop at first failing gate", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39989,
        skipSmoke: false,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    // ESLint should fail first, so only eslint results should appear
    expect(result.passed).toBe(false);
    const eslintResults = result.results.filter((r) => r.gate === "eslint");
    expect(eslintResults.length).toBe(1);
    // Test gate should not be reached
    const testResults = result.results.filter((r) => r.gate === "test");
    expect(testResults.length).toBe(0);
  });

  it("should skip smoke gate when skipSmoke is true", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39988,
        skipSmoke: true,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    const smokeResults = result.results.filter((r) => r.gate === "smoke");
    expect(smokeResults.length).toBe(0);
  });

  it("should skip playwright gate when skipPlaywright is true", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39987,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    const pwResults = result.results.filter((r) => r.gate === "playwright");
    expect(pwResults.length).toBe(0);
  });

  it("should have totalDurationMs greater than or equal to zero", async () => {
    const result = await runVerificationPipeline(
      {
        projectDir: "/nonexistent-pipeline-test-dir",
        port: 39986,
        skipSmoke: true,
        skipPlaywright: true,
        maxRetries: 1,
      },
      mockLogger,
    );
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
