import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface RunInfo {
  readonly runId: string;
  readonly startedAt: string;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly total: number;
  readonly durationMs?: number;
}

export async function listRuns(workspaceDir: string): Promise<void> {
  const entries = await readdir(workspaceDir).catch(() => []);
  const runs: RunInfo[] = [];

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const entry of entries) {
    if (!UUID_RE.test(entry)) continue;

    const summaryPath = join(workspaceDir, entry, `execution-summary.json`);
    const configPath = join(workspaceDir, entry, `config.json`);
    const resultPath = join(workspaceDir, entry, `pipeline-result.json`);

    try {
      const configRaw = await readFile(configPath, `utf-8`).catch(() => `{}`);
      const config = JSON.parse(configRaw);
      const summaryRaw = await readFile(summaryPath, `utf-8`).catch(() => ``);
      const resultRaw = await readFile(resultPath, `utf-8`).catch(() => ``);

      if (!summaryRaw) {
        // Run exists but has no summary — still in progress or crashed
        runs.push({
          runId: entry,
          startedAt: config.startedAt ?? `unknown`,
          completed: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          durationMs: undefined,
        });
        continue;
      }

      const summary = JSON.parse(summaryRaw);
      const result = resultRaw ? JSON.parse(resultRaw) : {};

      runs.push({
        runId: entry,
        startedAt: config.startedAt ?? summary.completedAt ?? `unknown`,
        completed: summary.completed ?? 0,
        failed: summary.failed ?? 0,
        skipped: summary.skipped ?? 0,
        total: (summary.completed ?? 0) + (summary.failed ?? 0) + (summary.skipped ?? 0),
        durationMs: result.durationMs,
      });
    } catch {
      // Not a valid run directory — skip
    }
  }

  if (runs.length === 0) {
    console.log(`No runs found in ${workspaceDir}/`);
    return;
  }

  // Sort by startedAt descending
  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  // Print table
  console.log(`\n  Run ID                                 | Started              | Status          | Tasks`);
  console.log(`  ${''.padEnd(40, '-')}|${''.padEnd(22, '-')}|${''.padEnd(17, '-')}|${''.padEnd(20, '-')}`);

  for (const run of runs) {
    const id = run.runId.substring(0, 36).padEnd(38);
    const started = (run.startedAt.substring(0, 19).replace(`T`, ` `) ?? ``).padEnd(20);
    const duration = run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : `in progress`;
    const status = duration.padEnd(15);
    const tasks = run.total > 0
      ? `${run.completed}/${run.total} passed${run.failed > 0 ? `, ${run.failed} failed` : ``}`
      : `no data`;

    console.log(`  ${id} | ${started} | ${status} | ${tasks}`);
  }

  console.log(``);
}
