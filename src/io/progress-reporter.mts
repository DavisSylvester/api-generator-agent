import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { CostTracker } from '../llm/cost-tracker.mts';

// ---------------------------------------------------------------------------
// ProgressReporter — live progress.md at `.workspace/<runId>/.docs/progress.md`.
//
// Rewritten atomically on every event (write-to-temp + rename) so a user
// tailing or `cat`-ing the file never sees a partial rewrite.
//
// Keeps a denormalized in-memory model (tasks + run metadata + cost snapshot)
// so each render is a pure function of state. Callers feed state via the
// update methods; render() is called from within each update so callers
// never have to think about when progress.md touches disk.
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface TaskStateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: TaskStatus;
  readonly iteration: number;
  readonly totalIterations: number;
  readonly lastEvent: string;
  readonly startedAt: string | undefined;
  readonly completedAt: string | undefined;
  readonly error: string | undefined;
  readonly activityPath: string;
}

export interface ProgressReporterInit {
  readonly runId: string;
  readonly progressPath: string;
  readonly prdSize: number;
  readonly provider: string;
  readonly maxIterations: number;
  readonly concurrency: number;
  readonly costTracker: CostTracker;
}

const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '⏳',
  'in-progress': '🔄',
  completed: '✅',
  failed: '❌',
};

export class ProgressReporter {

  private readonly runId: string;
  private readonly progressPath: string;
  private readonly prdSize: number;
  private readonly provider: string;
  private readonly maxIterations: number;
  private readonly concurrency: number;
  private readonly costTracker: CostTracker;

  private readonly startedAtIso: string;
  private readonly startedAtMs: number;
  private readonly tasks: Map<string, TaskStateSnapshot> = new Map();
  private readonly taskOrder: string[] = [];
  private codegenTotalMs: number = 0;
  private qaTotalMs: number = 0;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(init: ProgressReporterInit) {
    this.runId = init.runId;
    this.progressPath = init.progressPath;
    this.prdSize = init.prdSize;
    this.provider = init.provider;
    this.maxIterations = init.maxIterations;
    this.concurrency = init.concurrency;
    this.costTracker = init.costTracker;
    this.startedAtIso = new Date().toISOString();
    this.startedAtMs = Date.now();
  }

  public registerTasks(tasks: ReadonlyArray<{ readonly id: string; readonly name: string; readonly type: string; readonly activityPath: string }>): void {
    for (const task of tasks) {
      if (this.tasks.has(task.id)) continue;
      this.tasks.set(task.id, {
        id: task.id,
        name: task.name,
        type: task.type,
        status: 'pending',
        iteration: 0,
        totalIterations: 0,
        lastEvent: 'registered',
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
        activityPath: task.activityPath,
      });
      this.taskOrder.push(task.id);
    }
    this.scheduleRender();
  }

  public taskStarted(taskId: string): void {
    const prev = this.tasks.get(taskId);
    if (prev === undefined) return;
    this.tasks.set(taskId, {
      ...prev,
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      lastEvent: 'task-start',
    });
    this.scheduleRender();
  }

  public iterationStarted(taskId: string, iteration: number): void {
    const prev = this.tasks.get(taskId);
    if (prev === undefined) return;
    this.tasks.set(taskId, {
      ...prev,
      iteration,
      totalIterations: Math.max(prev.totalIterations, iteration),
      lastEvent: `iteration-${String(iteration)} start`,
    });
    this.scheduleRender();
  }

  public stepCompleted(taskId: string, step: 'codegen' | 'qa' | 'eslint', durationMs: number): void {
    if (step === 'codegen') this.codegenTotalMs += durationMs;
    if (step === 'qa') this.qaTotalMs += durationMs;
    const prev = this.tasks.get(taskId);
    if (prev === undefined) return;
    this.tasks.set(taskId, {
      ...prev,
      lastEvent: `${step}-end (${String(Math.round(durationMs))}ms)`,
    });
    this.scheduleRender();
  }

  public taskCompleted(taskId: string, result: { readonly passed: boolean; readonly error?: string; readonly iterations: number }): void {
    const prev = this.tasks.get(taskId);
    if (prev === undefined) return;
    this.tasks.set(taskId, {
      ...prev,
      status: result.passed ? 'completed' : 'failed',
      iteration: result.iterations,
      totalIterations: result.iterations,
      lastEvent: result.passed ? 'task-end (pass)' : `task-end (fail${result.error ? `: ${result.error.slice(0, 80)}` : ''})`,
      completedAt: new Date().toISOString(),
      error: result.error,
    });
    this.scheduleRender();
  }

  private scheduleRender(): void {
    this.writeChain = this.writeChain.then(() => this.renderAndWrite());
  }

  public async flush(): Promise<void> {
    await this.writeChain;
  }

  private async renderAndWrite(): Promise<void> {
    const body = this.render();
    await mkdir(dirname(this.progressPath), { recursive: true });
    const tmp = `${this.progressPath}.tmp`;
    await writeFile(tmp, body, { encoding: 'utf-8' });
    await rename(tmp, this.progressPath);
  }

  private render(): string {
    const now = Date.now();
    const elapsedMs = now - this.startedAtMs;
    const inProgress: TaskStateSnapshot[] = [];
    const completed: TaskStateSnapshot[] = [];
    const failed: TaskStateSnapshot[] = [];
    const pending: TaskStateSnapshot[] = [];

    for (const id of this.taskOrder) {
      const t = this.tasks.get(id);
      if (t === undefined) continue;
      if (t.status === 'in-progress') inProgress.push(t);
      else if (t.status === 'completed') completed.push(t);
      else if (t.status === 'failed') failed.push(t);
      else pending.push(t);
    }

    const total = this.taskOrder.length;
    const done = completed.length + failed.length;
    const cost = this.costTracker.getTotalCost();
    const calls = this.costTracker.getCallCount();
    const firstTryPasses = completed.filter((t) => t.totalIterations <= 1).length;
    const firstTryRate = completed.length === 0 ? 0 : (firstTryPasses / completed.length) * 100;

    const lines: string[] = [];
    lines.push(`# Pipeline Progress — ${this.runId}`);
    lines.push(``);
    lines.push(`> Live. Rewritten atomically on every pipeline event.`);
    lines.push(``);
    lines.push(`## Run`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Run ID | \`${this.runId}\` |`);
    lines.push(`| Started | \`${this.startedAtIso}\` |`);
    lines.push(`| Elapsed | \`${formatElapsed(elapsedMs)}\` |`);
    lines.push(`| Provider | \`${this.provider}\` |`);
    lines.push(`| Max iterations | ${String(this.maxIterations)} |`);
    lines.push(`| Concurrency | ${String(this.concurrency)} |`);
    lines.push(`| PRD size | ${String(this.prdSize)} chars |`);
    lines.push(``);
    lines.push(`## Metrics`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| Tasks complete | ${String(done)} / ${String(total)} (${completed.length} ✅ / ${failed.length} ❌) |`);
    lines.push(`| First-try pass rate | ${firstTryRate.toFixed(0)}% (${String(firstTryPasses)} / ${String(completed.length)}) |`);
    lines.push(`| Cumulative codegen | \`${formatElapsed(this.codegenTotalMs)}\` |`);
    lines.push(`| Cumulative qa | \`${formatElapsed(this.qaTotalMs)}\` |`);
    lines.push(`| LLM calls | ${String(calls)} |`);
    lines.push(`| LLM cost | $${cost.toFixed(4)} |`);
    lines.push(``);

    if (inProgress.length > 0) {
      lines.push(`## 🔄 In progress`);
      lines.push(``);
      lines.push(`| Task | Type | Iter | Last event | Activity |`);
      lines.push(`|---|---|---|---|---|`);
      for (const t of inProgress) {
        lines.push(`| ${STATUS_ICON[t.status]} \`${t.id}\` — ${escapePipe(t.name)} | \`${t.type}\` | ${String(t.iteration)}/${String(this.maxIterations)} | ${escapePipe(t.lastEvent)} | ${this.activityLink(t)} |`);
      }
      lines.push(``);
    }

    if (failed.length > 0) {
      lines.push(`## ❌ Failed`);
      lines.push(``);
      lines.push(`| Task | Iter | Error | Activity |`);
      lines.push(`|---|---|---|---|`);
      for (const t of failed) {
        lines.push(`| \`${t.id}\` — ${escapePipe(t.name)} | ${String(t.totalIterations)} | ${escapePipe(t.error ?? 'unknown')} | ${this.activityLink(t)} |`);
      }
      lines.push(``);
    }

    if (completed.length > 0) {
      lines.push(`## ✅ Completed`);
      lines.push(``);
      lines.push(`| Task | Type | Iter | Activity |`);
      lines.push(`|---|---|---|---|`);
      for (const t of completed) {
        lines.push(`| \`${t.id}\` — ${escapePipe(t.name)} | \`${t.type}\` | ${String(t.totalIterations)} | ${this.activityLink(t)} |`);
      }
      lines.push(``);
    }

    if (pending.length > 0) {
      lines.push(`## ⏳ Pending`);
      lines.push(``);
      for (const t of pending) {
        lines.push(`- \`${t.id}\` — ${escapePipe(t.name)}`);
      }
      lines.push(``);
    }

    return lines.join('\n');
  }

  private activityLink(t: TaskStateSnapshot): string {
    const rel = relative(dirname(this.progressPath), t.activityPath).replace(/\\/g, '/');
    return `[activity](${rel})`;
  }
}

const escapePipe = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const formatElapsed = (ms: number): string => {
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${String(s)}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${String(m)}m ${String(rs)}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${String(h)}h ${String(rm)}m`;
};
