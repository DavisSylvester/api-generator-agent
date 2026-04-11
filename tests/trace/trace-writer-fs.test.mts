import { describe, it, expect, mock } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceWriterFs } from "../../src/trace/trace-writer-fs.mts";
import type { ITraceEntry } from "../../src/core/interfaces/index.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

const sampleEntry: ITraceEntry = {
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
  documentation: "# Trace: render-interface\n\nGenerated work order interface.",
};

describe("TraceWriterFs", () => {
  it("should write trace entry to markdown file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    await writer.writeEntry(sampleEntry);

    const filePath = join(tmpDir, "render-interface-1.md");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("render-interface");
    expect(content).toContain("Interface generated");
  });

  it("should include comprehensive trace data in markdown", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    await writer.writeEntry(sampleEntry);

    const filePath = join(tmpDir, "render-interface-1.md");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("trace-001");
    expect(content).toContain("session-001");
    expect(content).toContain("work-orders");
    expect(content).toContain("Token Consumption");
    expect(content).toContain("500");
    expect(content).toContain("800");
    expect(content).toContain("Tool Uses");
    expect(content).toContain("file-write");
    expect(content).toContain("i-work-order.mts");
  });

  it("should write error details in markdown", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    const entryWithErrors: ITraceEntry = {
      ...sampleEntry,
      stepName: "render-with-errors",
      status: "failed",
      errors: [
        {
          message: "Type mismatch in repo",
          file: "repo.mts",
          line: 42,
          context: { expected: "string", got: "number" },
        },
      ],
    };

    await writer.writeEntry(entryWithErrors);

    const filePath = join(tmpDir, "render-with-errors-1.md");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("Errors");
    expect(content).toContain("Type mismatch in repo");
    expect(content).toContain("repo.mts");
  });

  it("should write multiple entries", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    const entry2: ITraceEntry = {
      ...sampleEntry,
      traceId: "trace-002",
      stepName: "render-schema",
      iteration: 1,
      documentation: "# Trace: render-schema\n\nGenerated schema.",
    };

    await writer.writeEntries([sampleEntry, entry2]);

    const file1 = await readFile(join(tmpDir, "render-interface-1.md"), "utf-8");
    const file2 = await readFile(join(tmpDir, "render-schema-1.md"), "utf-8");
    expect(file1).toBeTruthy();
    expect(file2).toBeTruthy();
  });

  it("should write summary report", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    await writer.writeSummary("session-001", [sampleEntry]);

    const content = await readFile(join(tmpDir, "generation-summary.md"), "utf-8");
    expect(content).toContain("# Generation Summary");
    expect(content).toContain("session-001");
    expect(content).toContain("render-interface");
    expect(content).toContain("success");
  });

  it("should include token breakdown in summary", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "trace-fs-test-"));
    const writer = new TraceWriterFs(tmpDir, mockLogger);

    await writer.writeSummary("session-001", [sampleEntry]);

    const content = await readFile(join(tmpDir, "generation-summary.md"), "utf-8");
    expect(content).toContain("Prompt Tokens");
    expect(content).toContain("Completion Tokens");
    expect(content).toContain("Total Errors");
  });
});
