import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "winston";
import type { ITraceEntry } from "../core/interfaces/index.mts";
import type { TraceLogger } from "./trace-logger.mts";

export interface SessionSummaryData {
  sessionId: string;
  generatedAt: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationMs: number;
  totalErrors: number;
  featuresCompleted: string[];
  featuresFailed: string[];
  filesGenerated: string[];
  filesModified: string[];
  totalLinesOfCode: number;
  featureBreakdown: FeatureBreakdown[];
  toolUseSummary: ToolUseSummary[];
}

export interface FeatureBreakdown {
  featureName: string;
  status: "success" | "failed" | "mixed";
  steps: number;
  successSteps: number;
  failedSteps: number;
  durationMs: number;
  tokens: number;
  filesGenerated: number;
  errors: string[];
}

export interface ToolUseSummary {
  toolName: string;
  totalCalls: number;
  totalDurationMs: number;
}

export function buildSessionSummary(
  traceLogger: TraceLogger,
): SessionSummaryData {
  const entries = traceLogger.getEntries();
  const sessionId = traceLogger.getSessionId();
  return buildSummaryFromEntries(sessionId, [...entries]);
}

export function buildSummaryFromEntries(
  sessionId: string,
  entries: ITraceEntry[],
): SessionSummaryData {
  const generatedAt = new Date().toISOString();

  const totalTokens = entries.reduce((s, e) => s + e.tokenConsumption.total, 0);
  const promptTokens = entries.reduce((s, e) => s + e.tokenConsumption.prompt, 0);
  const completionTokens = entries.reduce((s, e) => s + e.tokenConsumption.completion, 0);
  const totalDurationMs = entries.reduce((s, e) => s + e.durationMs, 0);
  const totalErrors = entries.reduce((s, e) => s + e.errors.length, 0);
  const totalLinesOfCode = entries.reduce((s, e) => s + e.result.linesOfCode, 0);

  const allFilesGenerated = collectUniqueStrings(entries.flatMap((e) => e.result.filesGenerated));
  const allFilesModified = collectUniqueStrings(entries.flatMap((e) => e.result.filesModified));

  const featureBreakdown = buildFeatureBreakdown(entries);

  const featuresCompleted = featureBreakdown
    .filter((f) => f.status === "success")
    .map((f) => f.featureName);

  const featuresFailed = featureBreakdown
    .filter((f) => f.status === "failed")
    .map((f) => f.featureName);

  const toolUseSummary = buildToolUseSummary(entries);

  return {
    sessionId,
    generatedAt,
    totalTokens,
    promptTokens,
    completionTokens,
    totalDurationMs,
    totalErrors,
    featuresCompleted,
    featuresFailed,
    filesGenerated: allFilesGenerated,
    filesModified: allFilesModified,
    totalLinesOfCode,
    featureBreakdown,
    toolUseSummary,
  };
}

function buildFeatureBreakdown(entries: ITraceEntry[]): FeatureBreakdown[] {
  const featureMap = new Map<string, ITraceEntry[]>();

  for (const entry of entries) {
    const existing = featureMap.get(entry.featureName) ?? [];
    existing.push(entry);
    featureMap.set(entry.featureName, existing);
  }

  const breakdown: FeatureBreakdown[] = [];

  for (const [featureName, featureEntries] of featureMap) {
    const successSteps = featureEntries.filter((e) => e.status === "success").length;
    const failedSteps = featureEntries.filter((e) => e.status === "failed").length;
    const durationMs = featureEntries.reduce((s, e) => s + e.durationMs, 0);
    const tokens = featureEntries.reduce((s, e) => s + e.tokenConsumption.total, 0);
    const filesGenerated = featureEntries.reduce(
      (s, e) => s + e.result.filesGenerated.length, 0,
    );

    const errors = featureEntries
      .flatMap((e) => e.errors)
      .map((e) => e.message);

    let status: "success" | "failed" | "mixed" = "success";
    if (failedSteps > 0 && successSteps === 0) {
      status = "failed";
    } else if (failedSteps > 0) {
      status = "mixed";
    }

    breakdown.push({
      featureName,
      status,
      steps: featureEntries.length,
      successSteps,
      failedSteps,
      durationMs,
      tokens,
      filesGenerated,
      errors,
    });
  }

  return breakdown;
}

function buildToolUseSummary(entries: ITraceEntry[]): ToolUseSummary[] {
  const toolMap = new Map<string, { totalCalls: number; totalDurationMs: number }>();

  for (const entry of entries) {
    for (const tool of entry.toolUses) {
      const existing = toolMap.get(tool.toolName) ?? { totalCalls: 0, totalDurationMs: 0 };
      existing.totalCalls += tool.callCount;
      existing.totalDurationMs += tool.totalDurationMs;
      toolMap.set(tool.toolName, existing);
    }
  }

  return Array.from(toolMap.entries()).map(([toolName, data]) => ({
    toolName,
    totalCalls: data.totalCalls,
    totalDurationMs: data.totalDurationMs,
  }));
}

function collectUniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

export function renderSessionSummaryMarkdown(summary: SessionSummaryData): string {
  const lines: string[] = [
    "# Session Summary Report",
    "",
    `**Session ID:** ${summary.sessionId}`,
    `**Generated:** ${summary.generatedAt}`,
    "",
    "## Overview",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Total Tokens | ${summary.totalTokens.toLocaleString()} |`,
    `| Prompt Tokens | ${summary.promptTokens.toLocaleString()} |`,
    `| Completion Tokens | ${summary.completionTokens.toLocaleString()} |`,
    `| Total Duration | ${formatDuration(summary.totalDurationMs)} |`,
    `| Total Errors | ${summary.totalErrors} |`,
    `| Features Completed | ${summary.featuresCompleted.length} |`,
    `| Features Failed | ${summary.featuresFailed.length} |`,
    `| Files Generated | ${summary.filesGenerated.length} |`,
    `| Files Modified | ${summary.filesModified.length} |`,
    `| Lines of Code | ${summary.totalLinesOfCode.toLocaleString()} |`,
    "",
  ];

  lines.push(...renderFeatureBreakdown(summary.featureBreakdown));
  lines.push(...renderToolUseSummary(summary.toolUseSummary));
  lines.push(...renderFileList(summary.filesGenerated));

  return lines.join("\n");
}

function renderFeatureBreakdown(features: FeatureBreakdown[]): string[] {
  if (features.length === 0) {
    return [];
  }

  const lines = [
    "## Feature Breakdown",
    "",
    "| Feature | Status | Steps | Duration | Tokens | Files | Errors |",
    "|---------|--------|-------|----------|--------|-------|--------|",
  ];

  for (const f of features) {
    const statusIcon = f.status === "success" ? "PASS" : f.status === "failed" ? "FAIL" : "MIXED";
    lines.push(
      `| ${f.featureName} | ${statusIcon} | ${f.successSteps}/${f.steps} | ${formatDuration(f.durationMs)} | ${f.tokens.toLocaleString()} | ${f.filesGenerated} | ${f.errors.length} |`,
    );
  }

  lines.push("");

  for (const f of features) {
    if (f.errors.length > 0) {
      lines.push(`### ${f.featureName} Errors`);
      lines.push("");
      for (const error of f.errors) {
        lines.push(`- ${error}`);
      }
      lines.push("");
    }
  }

  return lines;
}

function renderToolUseSummary(tools: ToolUseSummary[]): string[] {
  if (tools.length === 0) {
    return [];
  }

  return [
    "## Tool Usage",
    "",
    "| Tool | Calls | Duration |",
    "|------|-------|----------|",
    ...tools.map(
      (t) => `| ${t.toolName} | ${t.totalCalls} | ${formatDuration(t.totalDurationMs)} |`,
    ),
    "",
  ];
}

function renderFileList(files: string[]): string[] {
  if (files.length === 0) {
    return [];
  }

  return [
    "## Files Generated",
    "",
    ...files.map((f) => `- ${f}`),
    "",
  ];
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export async function writeSessionSummary(
  outputDir: string,
  traceLogger: TraceLogger,
  logger: Logger,
): Promise<string> {
  const summary = buildSessionSummary(traceLogger);
  const markdown = renderSessionSummaryMarkdown(summary);
  const filePath = join(outputDir, "session-summary.md");

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown, "utf-8");

  logger.info(`[session-summary] Written to ${filePath}`);
  return filePath;
}
