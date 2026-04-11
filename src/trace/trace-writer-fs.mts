import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Logger } from "winston";
import type { ITraceEntry } from "../core/interfaces/index.mts";

export class TraceWriterFs {

  private readonly docsDir: string;
  private readonly logger: Logger;

  constructor(docsDir: string, logger: Logger) {
    this.docsDir = docsDir;
    this.logger = logger;
  }

  public async writeEntry(entry: ITraceEntry): Promise<void> {
    const fileName = `${entry.stepName}-${entry.iteration}.md`;
    const filePath = join(this.docsDir, fileName);
    const content = renderEntryMarkdown(entry);

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      this.logger.info(`[trace-fs] Wrote trace entry: ${filePath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[trace-fs] Failed to write trace: ${msg}`);
    }
  }

  public async writeEntries(entries: readonly ITraceEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.writeEntry(entry);
    }
  }

  public async writeSummary(
    sessionId: string,
    entries: readonly ITraceEntry[],
  ): Promise<void> {
    const content = renderSummaryMarkdown(sessionId, entries);
    const filePath = join(this.docsDir, "generation-summary.md");

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      this.logger.info(`[trace-fs] Wrote summary: ${filePath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[trace-fs] Failed to write summary: ${msg}`);
    }
  }
}

function renderEntryMarkdown(entry: ITraceEntry): string {
  const lines: string[] = [
    `# Trace: ${entry.stepName}`,
    "",
    `- **Trace ID:** ${entry.traceId}`,
    `- **Session ID:** ${entry.sessionId}`,
    `- **Feature:** ${entry.featureName}`,
    `- **Step:** ${entry.stepName}`,
    `- **Iteration:** ${entry.iteration}`,
    `- **Status:** ${entry.status}`,
    `- **Duration:** ${entry.durationMs}ms`,
    `- **Started:** ${entry.startedAt}`,
    `- **Completed:** ${entry.completedAt}`,
    "",
  ];

  lines.push(...renderTokenSection(entry));
  lines.push(...renderToolUsesSection(entry));
  lines.push(...renderFilesSection(entry));
  lines.push(...renderErrorsSection(entry));

  lines.push("## Summary", "", entry.result.summary, "");

  return lines.join("\n");
}

function renderTokenSection(entry: ITraceEntry): string[] {
  return [
    "## Token Consumption",
    "",
    `| Type | Count |`,
    `|------|-------|`,
    `| Prompt | ${entry.tokenConsumption.prompt.toLocaleString()} |`,
    `| Completion | ${entry.tokenConsumption.completion.toLocaleString()} |`,
    `| **Total** | **${entry.tokenConsumption.total.toLocaleString()}** |`,
    "",
  ];
}

function renderToolUsesSection(entry: ITraceEntry): string[] {
  if (entry.toolUses.length === 0) {
    return [];
  }

  return [
    "## Tool Uses",
    "",
    "| Tool | Calls | Duration |",
    "|------|-------|----------|",
    ...entry.toolUses.map(
      (t) => `| ${t.toolName} | ${t.callCount} | ${t.totalDurationMs}ms |`,
    ),
    "",
  ];
}

function renderFilesSection(entry: ITraceEntry): string[] {
  const lines: string[] = [];

  if (entry.result.filesGenerated.length > 0) {
    lines.push("## Files Generated", "");
    for (const f of entry.result.filesGenerated) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  if (entry.result.filesModified.length > 0) {
    lines.push("## Files Modified", "");
    for (const f of entry.result.filesModified) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  if (entry.result.linesOfCode > 0) {
    lines.push(`**Lines of Code:** ${entry.result.linesOfCode}`, "");
  }

  return lines;
}

function renderErrorsSection(entry: ITraceEntry): string[] {
  if (entry.errors.length === 0) {
    return [];
  }

  const lines = ["## Errors", ""];

  for (const error of entry.errors) {
    lines.push(`### ${error.message}`);
    if (error.file) {
      lines.push(`- **File:** ${error.file}${error.line ? `:${error.line}` : ""}`);
    }
    if (error.stack) {
      lines.push("```", error.stack, "```");
    }
    if (Object.keys(error.context).length > 0) {
      lines.push(`- **Context:** \`${JSON.stringify(error.context)}\``);
    }
    lines.push("");
  }

  return lines;
}

function renderSummaryMarkdown(
  sessionId: string,
  entries: readonly ITraceEntry[],
): string {
  const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0);
  const totalTokens = entries.reduce((sum, e) => sum + e.tokenConsumption.total, 0);
  const promptTokens = entries.reduce((sum, e) => sum + e.tokenConsumption.prompt, 0);
  const completionTokens = entries.reduce((sum, e) => sum + e.tokenConsumption.completion, 0);
  const totalFiles = entries.reduce((sum, e) => sum + e.result.filesGenerated.length, 0);
  const totalErrors = entries.reduce((sum, e) => sum + e.errors.length, 0);
  const successCount = entries.filter((e) => e.status === "success").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return [
    "# Generation Summary",
    "",
    `- **Session ID:** ${sessionId}`,
    `- **Total Steps:** ${entries.length}`,
    `- **Successful:** ${successCount}`,
    `- **Failed:** ${failedCount}`,
    `- **Total Duration:** ${totalDuration}ms`,
    `- **Total Tokens:** ${totalTokens}`,
    `- **Prompt Tokens:** ${promptTokens}`,
    `- **Completion Tokens:** ${completionTokens}`,
    `- **Total Files:** ${totalFiles}`,
    `- **Total Errors:** ${totalErrors}`,
    "",
    "## Steps",
    "",
    "| Step | Feature | Status | Duration | Tokens | Files | Errors |",
    "|------|---------|--------|----------|--------|-------|--------|",
    ...entries.map((e) =>
      `| ${e.stepName} | ${e.featureName} | ${e.status} | ${e.durationMs}ms | ${e.tokenConsumption.total} | ${e.result.filesGenerated.length} | ${e.errors.length} |`,
    ),
    "",
  ].join("\n");
}
