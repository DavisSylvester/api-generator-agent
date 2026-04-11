import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TaskState } from "../types/task.mts";

export class SessionStore {

  public async generateHandoff(
    runId: string,
    taskStates: readonly TaskState[],
    workspaceRoot: string,
    prdName?: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const completed = taskStates.filter((s) => s.status === "completed");
    const failed = taskStates.filter((s) => s.status === "failed");
    const skipped = taskStates.filter((s) => s.status === "skipped");

    const taskTable = taskStates
      .map((s) => {
        const icon = s.status === "completed" ? "DONE" : s.status === "failed" ? "FAIL" : "SKIP";
        return `| ${s.taskId} | ${icon} | ${s.iteration} |`;
      })
      .join("\n");

    const failedSection = failed.length > 0
      ? [
          "## Failed Tasks",
          ...failed.map((s) =>
            `### ${s.taskId}\n- Iterations: ${s.iteration}\n- Error: ${s.lastError ?? "unknown"}\n`,
          ),
        ].join("\n")
      : "";

    const nextSteps = failed.length > 0
      ? [
          "## Next Steps",
          "- Review failed tasks above and address blocking errors",
          "- Re-run the pipeline with `bun run src/index.mts <prd-file> <max-iterations>`",
          "- Check `.workspace/<run-id>/` for detailed iteration logs",
        ].join("\n")
      : [
          "## Next Steps",
          "- All tasks completed successfully",
          "- Review generated code in `.workspace/<run-id>/` directories",
          "- Run `bun test` in the generated project to verify",
        ].join("\n");

    const markdown = [
      `# Session Handoff`,
      ``,
      `**Run ID:** ${runId}`,
      `**Date:** ${now}`,
      prdName ? `**PRD:** ${prdName}` : "",
      ``,
      `## Summary`,
      ``,
      `| Status | Count |`,
      `|--------|-------|`,
      `| Completed | ${completed.length} |`,
      `| Failed | ${failed.length} |`,
      `| Skipped | ${skipped.length} |`,
      `| Total | ${taskStates.length} |`,
      ``,
      `## Task Results`,
      ``,
      `| Task | Status | Iterations |`,
      `|------|--------|------------|`,
      taskTable,
      ``,
      failedSection,
      nextSteps,
    ]
      .filter((line) => line !== "")
      .join("\n");

    const handoffPath = `${workspaceRoot}/${runId}/SESSION-HANDOFF.md`;
    await mkdir(dirname(handoffPath), { recursive: true });
    await writeFile(handoffPath, markdown, "utf-8");

    return markdown;
  }
}
