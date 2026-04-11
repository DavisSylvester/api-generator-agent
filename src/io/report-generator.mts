import type { Task, TaskGraph, TaskState } from "../types/task.mts";
import type { CostSummary } from "../llm/cost-tracker.mts";

export interface ReportData {
  readonly runId: string;
  readonly durationMs: number;
  readonly prdLength: number;
  readonly llmProvider: string;
  readonly llmProviderHost?: string;
  readonly maxFixIterations: number;
  readonly maxConcurrency: number;
  readonly taskGraph: TaskGraph;
  readonly taskStates: readonly TaskState[];
  readonly integrationResults: Record<string, { passed: boolean; errors: readonly string[] }>;
  readonly documentationGenerated: boolean;
  readonly costSummary?: CostSummary;
  readonly generatedFiles: readonly GeneratedFileEntry[];
  readonly assembledIndexPath?: string;
}

export interface GeneratedFileEntry {
  readonly taskId: string;
  readonly filePath: string;
}

function statusIcon(status: string): string {
  switch (status) {
    case "completed": return "PASS";
    case "failed": return "FAIL";
    case "skipped": return "SKIP";
    default: return status;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function generateReport(data: ReportData): string {
  const lines: string[] = [];
  const completed = data.taskStates.filter((s) => s.status === "completed").length;
  const failed = data.taskStates.filter((s) => s.status === "failed").length;
  const skipped = data.taskStates.filter((s) => s.status === "skipped").length;
  const total = data.taskStates.length;

  // Header
  lines.push(`# Pipeline Run Report`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Run ID | \`${data.runId}\` |`);
  lines.push(`| Date | ${new Date().toISOString()} |`);
  lines.push(`| Duration | ${formatDuration(data.durationMs)} |`);
  lines.push(`| PRD Size | ${data.prdLength.toLocaleString()} chars |`);
  lines.push(`| LLM Provider | ${data.llmProvider}${data.llmProviderHost ? ` (${data.llmProviderHost})` : ""} |`);
  lines.push(`| Max Iterations | ${data.maxFixIterations} |`);
  lines.push(`| Concurrency | ${data.maxConcurrency} |`);
  lines.push(`| Tasks | ${completed} passed, ${failed} failed, ${skipped} skipped (${total} total) |`);
  lines.push(`| Documentation | ${data.documentationGenerated ? "Generated" : "Not generated"} |`);
  lines.push(``);

  // Task Plan
  lines.push(`## Task Plan`);
  lines.push(``);
  lines.push(`| # | Task ID | Name | Type | Dependencies |`);
  lines.push(`|---|---|---|---|---|`);
  data.taskGraph.tasks.forEach((task: Task, index: number) => {
    const deps = task.dependsOn.length > 0 ? task.dependsOn.join(", ") : "none";
    lines.push(`| ${index + 1} | \`${task.id}\` | ${task.name} | ${task.type} | ${deps} |`);
  });
  lines.push(``);

  // Task Results
  lines.push(`## Task Results`);
  lines.push(``);
  lines.push(`| Task ID | Status | Iterations | Error |`);
  lines.push(`|---|---|---|---|`);
  for (const state of data.taskStates) {
    const error = state.lastError ? state.lastError.substring(0, 100) : "-";
    lines.push(`| \`${state.taskId}\` | ${statusIcon(state.status)} | ${state.iteration} | ${error} |`);
  }
  lines.push(``);

  // Integration Test Results
  const integrationEntries = Object.entries(data.integrationResults);
  if (integrationEntries.length > 0) {
    lines.push(`## Integration Tests`);
    lines.push(``);
    lines.push(`| Task ID | Result | Errors |`);
    lines.push(`|---|---|---|`);
    for (const [taskId, result] of integrationEntries) {
      const errors = result.errors.length > 0 ? result.errors.join("; ").substring(0, 120) : "-";
      lines.push(`| \`${taskId}\` | ${result.passed ? "PASS" : "FAIL"} | ${errors} |`);
    }
    lines.push(``);
  }

  // Cost Summary
  if (data.costSummary && data.costSummary.callCount > 0) {
    lines.push(`## Cost Summary`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| LLM Calls | ${data.costSummary.callCount} |`);
    lines.push(`| Input Tokens | ${data.costSummary.totalInputTokens.toLocaleString()} |`);
    lines.push(`| Output Tokens | ${data.costSummary.totalOutputTokens.toLocaleString()} |`);
    lines.push(`| Total Cost | $${data.costSummary.totalCost.toFixed(4)} |`);
    lines.push(``);

    // Per-model breakdown
    const modelMap = new Map<string, { calls: number; input: number; output: number; cost: number }>();
    for (const usage of data.costSummary.usages) {
      const existing = modelMap.get(usage.model) ?? { calls: 0, input: 0, output: 0, cost: 0 };
      existing.calls++;
      existing.input += usage.inputTokens;
      existing.output += usage.outputTokens;
      existing.cost += usage.cost;
      modelMap.set(usage.model, existing);
    }

    if (modelMap.size > 1) {
      lines.push(`### Per-Model Breakdown`);
      lines.push(``);
      lines.push(`| Model | Calls | Input Tokens | Output Tokens | Cost |`);
      lines.push(`|---|---|---|---|---|`);
      for (const [model, stats] of modelMap) {
        lines.push(`| ${model} | ${stats.calls} | ${stats.input.toLocaleString()} | ${stats.output.toLocaleString()} | $${stats.cost.toFixed(4)} |`);
      }
      lines.push(``);
    }

    // Per-task cost
    const taskCostMap = new Map<string, number>();
    for (const usage of data.costSummary.usages) {
      if (usage.taskId) {
        taskCostMap.set(usage.taskId, (taskCostMap.get(usage.taskId) ?? 0) + usage.cost);
      }
    }

    if (taskCostMap.size > 0) {
      lines.push(`### Per-Task Cost`);
      lines.push(``);
      lines.push(`| Task ID | Cost |`);
      lines.push(`|---|---|`);
      for (const [taskId, cost] of [...taskCostMap.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`| \`${taskId}\` | $${cost.toFixed(4)} |`);
      }
      lines.push(``);
    }
  }

  // Generated Files
  if (data.generatedFiles.length > 0) {
    lines.push(`## Generated Files`);
    lines.push(``);

    const byTask = new Map<string, string[]>();
    for (const entry of data.generatedFiles) {
      const files = byTask.get(entry.taskId) ?? [];
      files.push(entry.filePath);
      byTask.set(entry.taskId, files);
    }

    for (const [taskId, files] of byTask) {
      lines.push(`### \`${taskId}\``);
      lines.push(``);
      for (const file of files) {
        lines.push(`- \`${file}\``);
      }
      lines.push(``);
    }
  }

  // Output Files
  lines.push(`## Output Files`);
  lines.push(``);
  lines.push(`| File | Description |`);
  lines.push(`|---|---|`);
  if (data.assembledIndexPath) {
    lines.push(`| \`docs/assembled-index.mts\` | Runnable Elysia app with all endpoint plugins wired |`);
  }
  if (data.documentationGenerated) {
    lines.push(`| \`docs/hoppscotch-collection.json\` | API collection for Hoppscotch |`);
  }
  lines.push(`| \`plan.json\` | Task dependency graph |`);
  lines.push(`| \`execution-summary.json\` | Task pass/fail status |`);
  lines.push(`| \`integration-results.json\` | Integration test results |`);
  lines.push(`| \`pipeline-result.json\` | Run metadata |`);
  lines.push(`| \`logs/run.log\` | Full pipeline log |`);
  lines.push(``);

  return lines.join("\n");
}
