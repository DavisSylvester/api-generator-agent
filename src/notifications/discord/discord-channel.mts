import { join } from 'node:path';
import type { Logger } from 'winston';
import type { NotificationChannel, PipelineEvent } from '../notifier.mts';
import type { ActivityEventInput } from '../../io/activity-log.mts';
import type { CostTracker } from '../../llm/cost-tracker.mts';
import type { ICardState } from './interfaces/i-card-state.mjs';
import type { IDiscordTransport } from './interfaces/i-discord-transport.mjs';
import { CardStateStore } from './card-state-store.mts';
import { EditDebouncer } from './edit-debouncer.mts';
import { buildCardEmbed, buildAlertEmbed, buildRunSummaryEmbed } from './card-formatter.mts';

export interface DiscordChannelConfig {
  readonly transport: IDiscordTransport;
  readonly logger: Logger;
  readonly costTracker: CostTracker;
  // The base workspace dir (e.g. ".workspace"). The run-specific dir is
  // computed when startRun is called: `<workspaceDir>/<runId>/`.
  readonly workspaceDir: string;
  readonly alertMention: string | undefined;
  readonly editWindowMs?: number;
}

interface RunContext {
  runId: string;
  threadId: string;
  totalTasks: number;
  startMs: number;
}

export class DiscordChannel implements NotificationChannel {

  public readonly name = 'discord';
  private readonly transport: IDiscordTransport;
  private readonly logger: Logger;
  private readonly costTracker: CostTracker;
  private readonly workspaceDir: string;
  private store: CardStateStore | undefined;
  private readonly debouncer: EditDebouncer;
  private readonly alertMention: string | undefined;
  private projectName: string = 'api-generator';
  private runCtx: RunContext | undefined;
  private healthy: boolean = true;

  constructor(config: DiscordChannelConfig) {
    this.transport = config.transport;
    this.logger = config.logger;
    this.costTracker = config.costTracker;
    this.workspaceDir = config.workspaceDir;
    this.alertMention = config.alertMention;
    this.debouncer = new EditDebouncer(
      (threadId, messageId, payload) => this.transport.editCard(threadId, messageId, payload),
      config.editWindowMs ?? 250,
    );
  }

  public setProjectName(name: string): void {
    this.projectName = name;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  public async startRun(runId: string, totalTasks: number): Promise<void> {
    if (!this.healthy) return;

    // State path is per-run: <workspaceDir>/<runId>/discord-cards.json.
    const statePath = join(this.workspaceDir, runId, 'discord-cards.json');
    this.store = new CardStateStore(statePath, this.transport.kind);

    // Resume path: look for an existing per-run state file and reattach.
    const persisted = await this.store.load();
    if (persisted !== undefined && persisted.runId === runId) {
      this.runCtx = {
        runId,
        threadId: persisted.threadId,
        totalTasks,
        startMs: performance.now(),
      };
      this.logger.info(`[discord] resumed run ${runId.slice(0, 8)} on thread ${persisted.threadId}`);
      return;
    }

    try {
      const summary = `**${this.projectName}** — run \`${runId.slice(0, 8)}\` started (${totalTasks} tasks)`;
      const { threadId } = await this.transport.startThread(runId, summary);
      this.store.init(runId, threadId);
      this.runCtx = { runId, threadId, totalTasks, startMs: performance.now() };
      this.logger.info(`[discord] thread created for run ${runId.slice(0, 8)}: ${threadId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[discord] startRun failed: ${msg} — disabling discord for this run`);
      this.healthy = false;
    }
  }

  public async finishRun(args: {
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
    readonly hardFailures: readonly string[];
    readonly durationMs: number;
    readonly reportPath: string;
  }): Promise<void> {
    if (!this.healthy || this.runCtx === undefined || this.store === undefined) return;

    // Drain pending edits before posting summary so the final card states
    // are visible before the summary lands.
    await this.debouncer.flushAll();
    await this.store.flush();

    const summary = this.costTracker.getSummary();
    const modelsUsed = [...new Set(summary.usages.map((u) => u.model))];

    const embed = buildRunSummaryEmbed({
      runId: this.runCtx.runId,
      workspaceDir: this.workspaceDir,
      totalTasks: this.runCtx.totalTasks,
      passed: args.passed,
      failed: args.failed,
      skipped: args.skipped,
      hardFailures: args.hardFailures,
      inputTokens: summary.totalInputTokens,
      outputTokens: summary.totalOutputTokens,
      totalCostUsd: summary.totalCost,
      modelsUsed,
      durationMs: args.durationMs,
      reportPath: args.reportPath,
    });

    try {
      await this.transport.postSummary(this.runCtx.threadId, { embeds: [embed] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[discord] finishRun summary post failed: ${msg}`);
    }
  }

  // ── NotificationChannel: task-level events ─────────────────────────────

  public async send(event: PipelineEvent): Promise<void> {
    if (!this.healthy || this.runCtx === undefined || this.store === undefined) return;
    if (event.taskId === undefined) return;

    switch (event.type) {
      case 'task_started':
        await this.onTaskStarted(event);
        break;
      case 'task_passed':
        await this.onTaskPassed(event);
        break;
      case 'task_failed':
        await this.onTaskFailed(event);
        break;
      case 'hard_failure':
        await this.onHardFailure(event);
        break;
      // status_update / pipeline_complete handled in finishRun() / progress reporter
      default:
        break;
    }
  }

  public async sendBatch(events: readonly PipelineEvent[]): Promise<void> {
    for (const e of events) {
      await this.send(e);
    }
  }

  // ── ActivityLog observer: step-level events ────────────────────────────

  public onActivityEvent(taskId: string, event: ActivityEventInput): void {
    if (!this.healthy || this.runCtx === undefined || this.store === undefined) return;
    if (!this.store.has(taskId)) return;
    const store = this.store;

    switch (event.type) {
      case 'iteration-start': {
        const iter = typeof event.meta?.iteration === 'number' ? event.meta.iteration : undefined;
        const next = store.update(taskId, {
          currentIteration: iter ?? 0,
          status: 'codegen',
          steps: [],
        });
        if (next !== undefined) this.queueEdit(next);
        break;
      }
      case 'codegen-start':
        this.setStatus(taskId, 'codegen');
        break;
      case 'codegen-end': {
        const model = typeof event.meta?.model === 'string' ? event.meta.model : undefined;
        const inputTokens = typeof event.meta?.inputTokens === 'number' ? event.meta.inputTokens : 0;
        const outputTokens = typeof event.meta?.outputTokens === 'number' ? event.meta.outputTokens : 0;
        this.recordStep(taskId, 'codegen', { durationMs: event.durationMs, ok: true, detail: event.summary });
        const next = store.update(taskId, {
          model: model ?? store.get(taskId)?.model,
          inputTokens: (store.get(taskId)?.inputTokens ?? 0) + inputTokens,
          outputTokens: (store.get(taskId)?.outputTokens ?? 0) + outputTokens,
          taskCostUsd: this.costTracker.getTaskCost(taskId),
          runCostUsd: this.costTracker.getSummary().totalCost,
        });
        if (next !== undefined) this.queueEdit(next);
        break;
      }
      case 'eslint-start':
        this.setStatus(taskId, 'eslint');
        break;
      case 'eslint-end':
        this.recordStep(taskId, 'eslint', {
          durationMs: event.durationMs,
          ok: !event.summary.toLowerCase().includes('issues'),
          detail: event.summary,
        });
        break;
      case 'qa-start':
        this.setStatus(taskId, 'qa');
        break;
      case 'qa-end': {
        const unitPassed = event.meta?.unitPassed === true;
        this.recordStep(taskId, 'qa', {
          durationMs: event.durationMs,
          ok: unitPassed,
          detail: event.summary,
        });
        break;
      }
      case 'iteration-end':
        // No status change here — the iteration-start of the next iteration,
        // or task-end, will set the next status.
        break;
      case 'task-end': {
        const status = event.meta?.status === 'completed' ? 'pass' : 'fail';
        const next = store.update(taskId, {
          status,
          finishedAt: Date.now(),
        });
        if (next !== undefined) this.queueEdit(next);
        break;
      }
      default:
        break;
    }
  }

  // ── private helpers ────────────────────────────────────────────────────

  private async onTaskStarted(event: PipelineEvent): Promise<void> {
    if (this.runCtx === undefined || this.store === undefined || event.taskId === undefined) return;
    if (this.store.has(event.taskId)) {
      // Resume case — card already exists. Just edit it back to "queued" coloring
      // in case the prior state was mid-flight.
      const next = this.store.update(event.taskId, { status: 'queued' });
      if (next !== undefined) this.queueEdit(next);
      return;
    }

    const placeholder: ICardState = {
      runId: this.runCtx.runId,
      taskId: event.taskId,
      taskName: event.taskName ?? event.taskId,
      taskType: 'task',
      status: 'queued',
      iterations: 0,
      currentIteration: 0,
      steps: [],
      inputTokens: 0,
      outputTokens: 0,
      taskCostUsd: 0,
      runCostUsd: this.costTracker.getSummary().totalCost,
      startedAt: Date.now(),
      threadId: this.runCtx.threadId,
      messageId: '',
      workspaceDir: this.workspaceDir,
    };

    try {
      const { messageId } = await this.transport.postCard(this.runCtx.threadId, {
        embeds: [buildCardEmbed(placeholder)],
      });
      this.store.set(event.taskId, { ...placeholder, messageId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[discord] postCard failed for ${event.taskId}: ${msg}`);
    }
  }

  private async onTaskPassed(event: PipelineEvent): Promise<void> {
    if (event.taskId === undefined || this.store === undefined) return;
    const next = this.store.update(event.taskId, {
      status: 'pass',
      finishedAt: Date.now(),
      iterations: event.iteration ?? this.store.get(event.taskId)?.iterations ?? 0,
    });
    if (next !== undefined) this.queueEdit(next);
  }

  private async onTaskFailed(event: PipelineEvent): Promise<void> {
    if (event.taskId === undefined || this.store === undefined) return;
    const next = this.store.update(event.taskId, {
      status: 'fail',
      finishedAt: Date.now(),
      lastError: event.message,
      iterations: event.iteration ?? this.store.get(event.taskId)?.iterations ?? 0,
    });
    if (next !== undefined) this.queueEdit(next);
  }

  private async onHardFailure(event: PipelineEvent): Promise<void> {
    if (event.taskId === undefined || this.runCtx === undefined || this.store === undefined) return;
    const next = this.store.update(event.taskId, {
      status: 'hard-fail',
      finishedAt: Date.now(),
      lastError: event.message,
    });
    if (next !== undefined) this.queueEdit(next);

    // Side-channel alert.
    if (next !== undefined) {
      const guildId = (this.transport as { guildId?: () => string | undefined }).guildId?.();
      const threadDeepLink = guildId !== undefined
        ? `https://discord.com/channels/${guildId}/${this.runCtx.threadId}`
        : undefined;

      try {
        await this.transport.postAlert({
          mention: this.alertMention,
          embed: buildAlertEmbed(next),
          threadDeepLink,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[discord] postAlert failed for ${event.taskId}: ${msg}`);
      }
    }
  }

  private setStatus(taskId: string, status: ICardState['status']): void {
    if (this.store === undefined) return;
    const next = this.store.update(taskId, { status });
    if (next !== undefined) this.queueEdit(next);
  }

  private recordStep(taskId: string, name: string, patch: { durationMs?: number; ok?: boolean; detail?: string }): void {
    if (this.store === undefined) return;
    const current = this.store.get(taskId);
    if (current === undefined) return;

    const existingIdx = current.steps.findIndex((s) => s.name === name);
    const nextStep = { name, ...patch };
    const steps = existingIdx >= 0
      ? [...current.steps.slice(0, existingIdx), nextStep, ...current.steps.slice(existingIdx + 1)]
      : [...current.steps, nextStep];

    const next = this.store.update(taskId, { steps });
    if (next !== undefined) this.queueEdit(next);
  }

  private queueEdit(state: ICardState): void {
    if (this.runCtx === undefined || state.messageId.length === 0) return;
    this.debouncer.queue(this.runCtx.threadId, state.messageId, {
      embeds: [buildCardEmbed(state)],
    });
  }
}
