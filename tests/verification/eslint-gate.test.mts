import { describe, it, expect, mock } from "bun:test";
import { runEslintGate } from "../../src/verification/eslint-gate.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("runEslintGate", () => {
  it("should return a verification result with gate 'eslint'", async () => {
    // Use a nonexistent dir so ESLint fails quickly
    const result = await runEslintGate("/nonexistent-path-eslint-test", mockLogger);
    expect(result.gate).toBe("eslint");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.durationMs).toBe("number");
  });

  it("should include metadata with attempt count", async () => {
    const result = await runEslintGate("/nonexistent-path-eslint-test", mockLogger, {
      maxRetries: 2,
    });
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.maxRetries).toBe(2);
    expect(typeof result.metadata?.attempts).toBe("number");
  });

  it("should respect maxRetries config", async () => {
    const result = await runEslintGate("/nonexistent-path-eslint-test", mockLogger, {
      maxRetries: 1,
    });
    expect(result.metadata?.attempts).toBeLessThanOrEqual(1);
    expect(result.metadata?.maxRetries).toBe(1);
  });

  it("should have durationMs greater than or equal to zero", async () => {
    const result = await runEslintGate("/nonexistent-path-eslint-test", mockLogger);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should fail when projectDir does not exist", async () => {
    const result = await runEslintGate("/no-such-dir-abc123", mockLogger);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
