import { ulid } from "ulid";
import type { ITraceEntry, IToolUse, ITraceError } from "../core/interfaces/index.mts";

export class TraceLogger {

  private readonly sessionId: string;
  private readonly entries: ITraceEntry[] = [];

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? ulid();
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public startStep(featureName: string, stepName: string, iteration: number): TraceStep {
    return new TraceStep(this.sessionId, featureName, stepName, iteration);
  }

  public recordEntry(entry: ITraceEntry): void {
    this.entries.push(entry);
  }

  public getEntries(): readonly ITraceEntry[] {
    return this.entries;
  }

  public getSummary(): TraceSummary {
    const totalDurationMs = this.entries.reduce((sum, e) => sum + e.durationMs, 0);
    const totalTokens = this.entries.reduce((sum, e) => sum + e.tokenConsumption.total, 0);
    const totalFiles = this.entries.reduce((sum, e) => sum + e.result.filesGenerated.length, 0);
    const successCount = this.entries.filter((e) => e.status === "success").length;
    const failedCount = this.entries.filter((e) => e.status === "failed").length;

    return {
      sessionId: this.sessionId,
      totalSteps: this.entries.length,
      successCount,
      failedCount,
      totalDurationMs,
      totalTokens,
      totalFiles,
    };
  }
}

export interface TraceSummary {
  sessionId: string;
  totalSteps: number;
  successCount: number;
  failedCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalFiles: number;
}

export class TraceStep {

  private readonly traceId: string;
  private readonly sessionId: string;
  private readonly featureName: string;
  private readonly stepName: string;
  private readonly iteration: number;
  private readonly startedAt: string;
  private readonly startMs: number;
  private readonly toolUses: IToolUse[] = [];
  private readonly errors: ITraceError[] = [];
  private readonly filesGenerated: string[] = [];
  private readonly filesModified: string[] = [];
  private promptTokens = 0;
  private completionTokens = 0;

  constructor(sessionId: string, featureName: string, stepName: string, iteration: number) {
    this.traceId = ulid();
    this.sessionId = sessionId;
    this.featureName = featureName;
    this.stepName = stepName;
    this.iteration = iteration;
    this.startedAt = new Date().toISOString();
    this.startMs = performance.now();
  }

  public addToolUse(toolName: string, durationMs: number): void {
    const existing = this.toolUses.find((t) => t.toolName === toolName);
    if (existing) {
      existing.callCount++;
      existing.totalDurationMs += durationMs;
    } else {
      this.toolUses.push({ toolName, callCount: 1, totalDurationMs: durationMs });
    }
  }

  public addError(message: string, context?: Record<string, unknown>): void {
    this.errors.push({ message, context: context ?? {} });
  }

  public addFilesGenerated(paths: string[]): void {
    this.filesGenerated.push(...paths);
  }

  public addFilesModified(paths: string[]): void {
    this.filesModified.push(...paths);
  }

  public setTokens(prompt: number, completion: number): void {
    this.promptTokens = prompt;
    this.completionTokens = completion;
  }

  public complete(
    status: "success" | "failed" | "skipped",
    summary: string,
  ): ITraceEntry {
    const completedAt = new Date().toISOString();
    const durationMs = Math.round(performance.now() - this.startMs);
    const linesOfCode = this.filesGenerated.length * 50; // Rough estimate

    return {
      traceId: this.traceId,
      sessionId: this.sessionId,
      featureName: this.featureName,
      stepName: this.stepName,
      iteration: this.iteration,
      startedAt: this.startedAt,
      completedAt,
      durationMs,
      status,
      toolUses: [...this.toolUses],
      tokenConsumption: {
        prompt: this.promptTokens,
        completion: this.completionTokens,
        total: this.promptTokens + this.completionTokens,
      },
      result: {
        filesGenerated: [...this.filesGenerated],
        filesModified: [...this.filesModified],
        linesOfCode,
        summary,
      },
      errors: [...this.errors],
      documentation: this.buildDocumentation(status, summary, durationMs),
    };
  }

  private buildDocumentation(
    status: string,
    summary: string,
    durationMs: number,
  ): string {
    const lines = [
      `# Trace: ${this.stepName}`,
      ``,
      `- **Trace ID:** ${this.traceId}`,
      `- **Feature:** ${this.featureName}`,
      `- **Step:** ${this.stepName}`,
      `- **Iteration:** ${this.iteration}`,
      `- **Status:** ${status}`,
      `- **Duration:** ${durationMs}ms`,
      `- **Started:** ${this.startedAt}`,
      ``,
      `## Summary`,
      summary,
      ``,
      `## Files Generated`,
      ...this.filesGenerated.map((f) => `- ${f}`),
      ``,
    ];

    if (this.errors.length > 0) {
      lines.push(`## Errors`);
      for (const err of this.errors) {
        lines.push(`- ${err.message}`);
      }
    }

    return lines.join("\n");
  }
}
