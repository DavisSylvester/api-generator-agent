import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function showStatus(workspaceDir: string, runId: string): Promise<void> {
  const runDir = join(workspaceDir, runId);

  // Load config
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(join(runDir, `config.json`), `utf-8`));
  } catch {
    console.error(`Run not found: ${runId}`);
    console.error(`No config.json at ${runDir}/config.json`);
    process.exit(1);
  }

  // Load plan
  let tasks: Array<{ id: string; name: string; type: string; dependsOn: string[] }> = [];
  try {
    const plan = JSON.parse(await readFile(join(runDir, `plan.json`), `utf-8`));
    tasks = plan.tasks ?? [];
  } catch {
    // No plan yet
  }

  // Load execution summary
  let summary: Record<string, unknown> | undefined;
  try {
    summary = JSON.parse(await readFile(join(runDir, `execution-summary.json`), `utf-8`));
  } catch {
    // Not finished yet
  }

  // Load per-task status
  const taskStatuses = new Map<string, { status: string; iteration: number; lastError?: string; circuitBroken?: boolean }>();
  const tasksDir = join(runDir, `tasks`);
  try {
    const taskDirs = await readdir(tasksDir);
    for (const taskId of taskDirs) {
      try {
        const statusRaw = await readFile(join(tasksDir, taskId, `status.json`), `utf-8`);
        taskStatuses.set(taskId, JSON.parse(statusRaw));
      } catch {
        // No status yet — task hasn't started or is in progress
      }
    }
  } catch {
    // No tasks dir
  }

  // Load token usage
  let tokenUsage: { cumulative?: { totalTokens?: number; promptTokens?: number; completionTokens?: number } } | undefined;
  try {
    tokenUsage = JSON.parse(await readFile(join(runDir, `token-usage.json`), `utf-8`));
  } catch {
    // No token data
  }

  // Load pipeline result
  let pipelineResult: Record<string, unknown> | undefined;
  try {
    pipelineResult = JSON.parse(await readFile(join(runDir, `pipeline-result.json`), `utf-8`));
  } catch {
    // Not finished
  }

  // Print report
  console.log(`\n  === Run: ${runId} ===\n`);
  console.log(`  Started:      ${String(config.startedAt ?? `unknown`)}`);
  console.log(`  Iterations:   ${String(config.maxFixIterations ?? `?`)}`);
  console.log(`  Concurrency:  ${String(config.maxConcurrency ?? `?`)}`);

  if (pipelineResult) {
    const durationSec = Math.round(Number(pipelineResult.durationMs ?? 0) / 1000);
    console.log(`  Duration:     ${durationSec}s`);
    console.log(`  Completed:    ${String(pipelineResult.completedAt ?? `unknown`)}`);
  } else {
    console.log(`  Duration:     in progress (or crashed)`);
  }

  if (tokenUsage?.cumulative) {
    const c = tokenUsage.cumulative;
    console.log(`  Tokens:       ${(c.totalTokens ?? 0).toLocaleString()} total (${(c.promptTokens ?? 0).toLocaleString()} prompt + ${(c.completionTokens ?? 0).toLocaleString()} completion)`);
  }

  // Task table
  console.log(`\n  Tasks (${tasks.length} total):\n`);
  console.log(`    Status  | Iter | Task ID                          | Name`);
  console.log(`    ${''.padEnd(8, '-')}|${''.padEnd(6, '-')}|${''.padEnd(34, '-')}|${''.padEnd(30, '-')}`);

  for (const task of tasks) {
    const status = taskStatuses.get(task.id);
    let icon: string;
    let iter: string;

    if (!status) {
      icon = `PEND`;
      iter = `-`;
    } else if (status.status === `completed`) {
      icon = `OK`;
      iter = String(status.iteration);
    } else if (status.status === `failed`) {
      icon = status.circuitBroken ? `CB` : `FAIL`;
      iter = String(status.iteration);
    } else if (status.status === `skipped`) {
      icon = `SKIP`;
      iter = `-`;
    } else {
      icon = `RUN`;
      iter = String(status.iteration);
    }

    const iconPad = icon.padEnd(6);
    const iterPad = iter.padEnd(4);
    const idPad = task.id.padEnd(32);
    console.log(`    ${iconPad} | ${iterPad} | ${idPad} | ${task.name}`);

    if (status?.lastError) {
      console.log(`           |      |                                  | Error: ${status.lastError.substring(0, 80)}`);
    }
  }

  // Summary
  if (summary) {
    console.log(`\n  Summary: ${String(summary.completed)} completed, ${String(summary.failed)} failed, ${String(summary.skipped)} skipped`);
  } else {
    const completedCount = [...taskStatuses.values()].filter((s) => s.status === `completed`).length;
    const failedCount = [...taskStatuses.values()].filter((s) => s.status === `failed`).length;
    const pending = tasks.length - completedCount - failedCount;
    console.log(`\n  In progress: ${completedCount} completed, ${failedCount} failed, ${pending} pending`);
    if (completedCount > 0) {
      console.log(`  Resume with: bun run src/index.mts --resume ${runId}`);
    }
  }

  console.log(``);
}
