import { describe, it, expect, mock } from "bun:test";
import { runPlaywrightGate } from "../../src/verification/playwright-gate.mts";
import type { Logger } from "winston";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("runPlaywrightGate", () => {
  it("should return a verification result with gate 'playwright'", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "pw-gate-test-"));
    const result = await runPlaywrightGate(
      {
        port: 39994,
        apiName: "test-api",
        screenshotPath: join(tmpDir, "screenshot.png"),
        timeoutMs: 3000,
      },
      mockLogger,
    );
    expect(result.gate).toBe("playwright");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.durationMs).toBe("number");
  });

  it("should fail when no server is running", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "pw-gate-test-"));
    const result = await runPlaywrightGate(
      {
        port: 39993,
        apiName: "test-api",
        screenshotPath: join(tmpDir, "screenshot.png"),
        timeoutMs: 3000,
      },
      mockLogger,
    );
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should have durationMs greater than or equal to zero", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "pw-gate-test-"));
    const result = await runPlaywrightGate(
      {
        port: 39992,
        apiName: "test-api",
        screenshotPath: join(tmpDir, "screenshot.png"),
        timeoutMs: 3000,
      },
      mockLogger,
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
