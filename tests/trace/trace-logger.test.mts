import { describe, it, expect } from "bun:test";
import { TraceLogger, TraceStep } from "../../src/trace/trace-logger.mts";

describe("TraceLogger", () => {
  it("should generate a session ID", () => {
    const logger = new TraceLogger();
    expect(logger.getSessionId()).toBeTruthy();
    expect(logger.getSessionId().length).toBeGreaterThan(0);
  });

  it("should use provided session ID", () => {
    const logger = new TraceLogger("custom-session-id");
    expect(logger.getSessionId()).toBe("custom-session-id");
  });

  it("should record entries", () => {
    const logger = new TraceLogger();
    const step = logger.startStep("work-orders", "render-interface", 1);
    step.addFilesGenerated(["src/interfaces/i-work-order.mts"]);
    const entry = step.complete("success", "Generated interface");
    logger.recordEntry(entry);

    expect(logger.getEntries()).toHaveLength(1);
    expect(logger.getEntries()[0]?.status).toBe("success");
  });

  it("should generate summary", () => {
    const logger = new TraceLogger();

    const step1 = logger.startStep("work-orders", "render-interface", 1);
    step1.addFilesGenerated(["file1.mts"]);
    logger.recordEntry(step1.complete("success", "OK"));

    const step2 = logger.startStep("work-orders", "render-schema", 1);
    step2.addFilesGenerated(["file2.mts"]);
    step2.addError("Schema error");
    logger.recordEntry(step2.complete("failed", "Error"));

    const summary = logger.getSummary();
    expect(summary.totalSteps).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.totalFiles).toBe(2);
  });
});

describe("TraceStep", () => {
  it("should track tool uses", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    step.addToolUse("file-write", 100);
    step.addToolUse("file-write", 200);
    step.addToolUse("eslint", 300);

    const entry = step.complete("success", "Done");
    expect(entry.toolUses).toHaveLength(2);
    expect(entry.toolUses[0]?.toolName).toBe("file-write");
    expect(entry.toolUses[0]?.callCount).toBe(2);
    expect(entry.toolUses[0]?.totalDurationMs).toBe(300);
    expect(entry.toolUses[1]?.toolName).toBe("eslint");
  });

  it("should track errors", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    step.addError("Import not found", { file: "repo.mts" });
    step.addError("Type mismatch");

    const entry = step.complete("failed", "Errors found");
    expect(entry.errors).toHaveLength(2);
    expect(entry.errors[0]?.message).toBe("Import not found");
    expect(entry.errors[0]?.context.file).toBe("repo.mts");
  });

  it("should track token consumption", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    step.setTokens(1000, 2000);

    const entry = step.complete("success", "Done");
    expect(entry.tokenConsumption.prompt).toBe(1000);
    expect(entry.tokenConsumption.completion).toBe(2000);
    expect(entry.tokenConsumption.total).toBe(3000);
  });

  it("should generate documentation markdown", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    step.addFilesGenerated(["repo.mts"]);

    const entry = step.complete("success", "Repository generated");
    expect(entry.documentation).toContain("# Trace: render-repo");
    expect(entry.documentation).toContain("work-orders");
    expect(entry.documentation).toContain("repo.mts");
    expect(entry.documentation).toContain("success");
  });

  it("should include error section in documentation", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    step.addError("Something went wrong");

    const entry = step.complete("failed", "Failed");
    expect(entry.documentation).toContain("## Errors");
    expect(entry.documentation).toContain("Something went wrong");
  });

  it("should measure duration", () => {
    const step = new TraceStep("session-1", "work-orders", "render-repo", 1);
    const entry = step.complete("success", "Done");
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.startedAt).toBeTruthy();
    expect(entry.completedAt).toBeTruthy();
  });
});
