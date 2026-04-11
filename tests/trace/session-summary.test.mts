import { describe, it, expect, mock } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSessionSummary,
  buildSummaryFromEntries,
  renderSessionSummaryMarkdown,
  writeSessionSummary,
} from "../../src/trace/session-summary.mts";
import { TraceLogger } from "../../src/trace/trace-logger.mts";
import type { ITraceEntry } from "../../src/core/interfaces/index.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

function makeSampleEntry(overrides?: Partial<ITraceEntry>): ITraceEntry {
  return {
    traceId: "trace-001",
    sessionId: "session-001",
    featureName: "work-orders",
    stepName: "render-interface",
    iteration: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs: 1000,
    status: "success",
    toolUses: [{ toolName: "file-write", callCount: 3, totalDurationMs: 100 }],
    tokenConsumption: { prompt: 500, completion: 800, total: 1300 },
    result: {
      filesGenerated: ["i-work-order.mts"],
      filesModified: [],
      linesOfCode: 50,
      summary: "Interface generated",
    },
    errors: [],
    documentation: "",
    ...overrides,
  };
}

describe("buildSummaryFromEntries", () => {
  it("should aggregate token totals", () => {
    const entries = [
      makeSampleEntry({ tokenConsumption: { prompt: 100, completion: 200, total: 300 } }),
      makeSampleEntry({
        traceId: "trace-002",
        tokenConsumption: { prompt: 400, completion: 500, total: 900 },
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.totalTokens).toBe(1200);
    expect(summary.promptTokens).toBe(500);
    expect(summary.completionTokens).toBe(700);
  });

  it("should aggregate duration", () => {
    const entries = [
      makeSampleEntry({ durationMs: 1000 }),
      makeSampleEntry({ traceId: "trace-002", durationMs: 2000 }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.totalDurationMs).toBe(3000);
  });

  it("should count errors", () => {
    const entries = [
      makeSampleEntry({
        errors: [
          { message: "err1", context: {} },
          { message: "err2", context: {} },
        ],
      }),
      makeSampleEntry({ traceId: "trace-002", errors: [{ message: "err3", context: {} }] }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.totalErrors).toBe(3);
  });

  it("should categorize features as completed or failed", () => {
    const entries = [
      makeSampleEntry({ featureName: "orders", status: "success" }),
      makeSampleEntry({
        traceId: "trace-002",
        featureName: "inventory",
        status: "failed",
        errors: [{ message: "failed", context: {} }],
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.featuresCompleted).toContain("orders");
    expect(summary.featuresFailed).toContain("inventory");
  });

  it("should collect unique files generated", () => {
    const entries = [
      makeSampleEntry({
        result: { filesGenerated: ["a.mts", "b.mts"], filesModified: [], linesOfCode: 10, summary: "ok" },
      }),
      makeSampleEntry({
        traceId: "trace-002",
        result: { filesGenerated: ["b.mts", "c.mts"], filesModified: [], linesOfCode: 10, summary: "ok" },
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.filesGenerated).toHaveLength(3);
    expect(summary.filesGenerated).toContain("a.mts");
    expect(summary.filesGenerated).toContain("b.mts");
    expect(summary.filesGenerated).toContain("c.mts");
  });

  it("should build feature breakdown", () => {
    const entries = [
      makeSampleEntry({ featureName: "orders", status: "success" }),
      makeSampleEntry({
        traceId: "trace-002",
        featureName: "orders",
        stepName: "render-schema",
        status: "success",
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.featureBreakdown).toHaveLength(1);
    expect(summary.featureBreakdown[0]?.featureName).toBe("orders");
    expect(summary.featureBreakdown[0]?.steps).toBe(2);
    expect(summary.featureBreakdown[0]?.successSteps).toBe(2);
    expect(summary.featureBreakdown[0]?.status).toBe("success");
  });

  it("should report mixed status when feature has both success and failure", () => {
    const entries = [
      makeSampleEntry({ featureName: "orders", status: "success" }),
      makeSampleEntry({
        traceId: "trace-002",
        featureName: "orders",
        stepName: "render-schema",
        status: "failed",
        errors: [{ message: "schema error", context: {} }],
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    expect(summary.featureBreakdown[0]?.status).toBe("mixed");
  });

  it("should build tool use summary", () => {
    const entries = [
      makeSampleEntry({
        toolUses: [
          { toolName: "file-write", callCount: 3, totalDurationMs: 100 },
          { toolName: "eslint", callCount: 1, totalDurationMs: 200 },
        ],
      }),
      makeSampleEntry({
        traceId: "trace-002",
        toolUses: [
          { toolName: "file-write", callCount: 2, totalDurationMs: 50 },
        ],
      }),
    ];

    const summary = buildSummaryFromEntries("session-001", entries);
    const fwTool = summary.toolUseSummary.find((t) => t.toolName === "file-write");
    expect(fwTool?.totalCalls).toBe(5);
    expect(fwTool?.totalDurationMs).toBe(150);
  });
});

describe("buildSessionSummary", () => {
  it("should work with TraceLogger instance", () => {
    const traceLogger = new TraceLogger("session-test");

    const step1 = traceLogger.startStep("orders", "render-interface", 1);
    step1.addFilesGenerated(["i-order.mts"]);
    step1.setTokens(100, 200);
    traceLogger.recordEntry(step1.complete("success", "OK"));

    const summary = buildSessionSummary(traceLogger);
    expect(summary.sessionId).toBe("session-test");
    expect(summary.totalTokens).toBe(300);
    expect(summary.featuresCompleted).toContain("orders");
  });
});

describe("renderSessionSummaryMarkdown", () => {
  it("should render valid markdown", () => {
    const entries = [makeSampleEntry()];
    const summary = buildSummaryFromEntries("session-001", entries);
    const markdown = renderSessionSummaryMarkdown(summary);

    expect(markdown).toContain("# Session Summary Report");
    expect(markdown).toContain("session-001");
    expect(markdown).toContain("Overview");
    expect(markdown).toContain("Feature Breakdown");
    expect(markdown).toContain("work-orders");
  });

  it("should include tool usage section", () => {
    const entries = [makeSampleEntry()];
    const summary = buildSummaryFromEntries("session-001", entries);
    const markdown = renderSessionSummaryMarkdown(summary);

    expect(markdown).toContain("Tool Usage");
    expect(markdown).toContain("file-write");
  });

  it("should include file list section", () => {
    const entries = [makeSampleEntry()];
    const summary = buildSummaryFromEntries("session-001", entries);
    const markdown = renderSessionSummaryMarkdown(summary);

    expect(markdown).toContain("Files Generated");
    expect(markdown).toContain("i-work-order.mts");
  });

  it("should format large token counts with separators", () => {
    const entries = [
      makeSampleEntry({
        tokenConsumption: { prompt: 10000, completion: 20000, total: 30000 },
      }),
    ];
    const summary = buildSummaryFromEntries("session-001", entries);
    const markdown = renderSessionSummaryMarkdown(summary);

    expect(markdown).toContain("30,000");
  });
});

describe("writeSessionSummary", () => {
  it("should write session summary to file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "session-summary-test-"));
    const traceLogger = new TraceLogger("session-write-test");

    const step = traceLogger.startStep("orders", "render-interface", 1);
    step.addFilesGenerated(["i-order.mts"]);
    traceLogger.recordEntry(step.complete("success", "OK"));

    const filePath = await writeSessionSummary(tmpDir, traceLogger, mockLogger);
    const content = await readFile(filePath, "utf-8");

    expect(content).toContain("# Session Summary Report");
    expect(content).toContain("session-write-test");
    expect(content).toContain("orders");
  });
});
