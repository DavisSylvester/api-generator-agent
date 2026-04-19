import { describe, it, expect, mock, beforeEach } from "bun:test";
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

// Mock `playwright` so the gate never spawns a real browser.
// Each test tweaks page.goto's behavior to simulate success vs failure.
const mockPage = {
  goto: mock(async () => {
    throw new Error("net::ERR_CONNECTION_REFUSED");
  }),
  title: mock(async () => "Swagger UI"),
  screenshot: mock(async () => undefined),
};

const mockBrowser = {
  newPage: mock(async () => mockPage),
  close: mock(async () => undefined),
};

mock.module("playwright", () => ({
  chromium: {
    launch: mock(async () => mockBrowser),
  },
}));

// Import after the mock registration so the dynamic `await import("playwright")`
// inside runPlaywrightGate resolves to the mocked module.
const { runPlaywrightGate } = await import("../../src/verification/playwright-gate.mts");

describe("runPlaywrightGate", () => {
  beforeEach(() => {
    // Default scenario: server not reachable — page.goto throws.
    mockPage.goto.mockImplementation(async () => {
      throw new Error("net::ERR_CONNECTION_REFUSED");
    });
  });

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
