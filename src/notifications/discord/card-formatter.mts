import type { ICardState, CardStep } from './interfaces/i-card-state.mjs';
import type { DiscordEmbed, DiscordEmbedField } from './interfaces/i-discord-transport.mjs';

const COLOR_RUNNING = 0xFFAA00;
const COLOR_PASS    = 0x2ECC71;
const COLOR_FAIL    = 0xE74C3C;
const COLOR_QUEUED  = 0x95A5A6;

const MAX_FIELD_VALUE = 1024;
const MAX_DESCRIPTION = 4096;
const MAX_ERROR_PREVIEW = 1000;

const STATUS_EMOJI: Record<ICardState['status'], string> = {
  queued: '⏳',
  codegen: '🟡',
  eslint: '🟡',
  qa: '🟡',
  pass: '✅',
  fail: '❌',
  'hard-fail': '🚨',
};

const truncate = (s: string, n: number): string => s.length <= n ? s : `${s.slice(0, n - 1)}…`;

function colorFor(status: ICardState['status']): number {
  switch (status) {
    case 'pass': return COLOR_PASS;
    case 'fail': return COLOR_FAIL;
    case 'hard-fail': return COLOR_FAIL;
    case 'queued': return COLOR_QUEUED;
    default: return COLOR_RUNNING;
  }
}

function formatStep(step: CardStep): string {
  const name = step.name;
  const dur = step.durationMs !== undefined ? `${(step.durationMs / 1000).toFixed(1)}s` : '…';
  const mark = step.ok === true ? '✓' : step.ok === false ? '✗' : '·';
  const detail = step.detail !== undefined ? ` · ${step.detail}` : '';
  return `${mark} ${name} (${dur})${detail}`;
}

function buildDescription(state: ICardState): string {
  const emoji = STATUS_EMOJI[state.status];
  const parts: string[] = [`${emoji} **${state.taskName}**`];

  if (state.steps.length > 0) {
    parts.push(state.steps.map(formatStep).join(' → '));
  }

  if (state.status !== 'pass' && state.status !== 'fail' && state.status !== 'hard-fail') {
    parts.push(`Iteration **${state.currentIteration}**/${state.iterations}`);
  }

  return truncate(parts.join('\n'), MAX_DESCRIPTION);
}

export function buildCardEmbed(state: ICardState): DiscordEmbed {
  const fields: DiscordEmbedField[] = [];

  fields.push({ name: 'Status',    value: `\`${state.status}\``,                              inline: true });
  fields.push({ name: 'Type',      value: `\`${state.taskType}\``,                            inline: true });
  fields.push({ name: 'Iteration', value: `${state.currentIteration} / ${state.iterations}`,  inline: true });

  if (state.model !== undefined) {
    fields.push({ name: 'Model', value: `\`${state.model}\``, inline: true });
  }

  // Step rollups — compress to one field each so we stay within 25 max.
  const codegen = state.steps.find((s) => s.name === 'codegen');
  const eslint  = state.steps.find((s) => s.name === 'eslint');
  const qa      = state.steps.find((s) => s.name === 'qa');

  if (codegen !== undefined) {
    fields.push({ name: 'Codegen', value: formatStep(codegen), inline: true });
  }
  if (eslint !== undefined) {
    fields.push({ name: 'ESLint', value: formatStep(eslint), inline: true });
  }
  if (qa !== undefined) {
    fields.push({ name: 'QA', value: formatStep(qa), inline: true });
  }

  fields.push({
    name: 'Tokens',
    value: `${state.inputTokens.toLocaleString()} in / ${state.outputTokens.toLocaleString()} out`,
    inline: true,
  });

  fields.push({
    name: 'Cost',
    value: `$${state.taskCostUsd.toFixed(4)} task / $${state.runCostUsd.toFixed(4)} run`,
    inline: true,
  });

  const startedSec = Math.floor(state.startedAt / 1000);
  fields.push({ name: 'Started', value: `<t:${startedSec}:T>`, inline: true });

  const endMs = state.finishedAt ?? Date.now();
  const durSec = Math.max(0, Math.round((endMs - state.startedAt) / 1000));
  fields.push({ name: 'Duration', value: `${durSec}s`, inline: true });

  fields.push({ name: 'Run',       value: `\`${state.runId.slice(0, 8)}\``, inline: true });
  fields.push({ name: 'Workspace', value: `\`${state.workspaceDir}\``,      inline: false });

  if (state.lastError !== undefined && state.lastError.length > 0) {
    fields.push({
      name: 'Last Error',
      value: `\`\`\`${truncate(state.lastError, MAX_FIELD_VALUE - 10)}\`\`\``,
      inline: false,
    });
  }

  return {
    title: `Task: ${state.taskName}`,
    description: buildDescription(state),
    color: colorFor(state.status),
    fields,
    footer: {
      text: `iter ${state.currentIteration} · ${state.model ?? '—'} · run ${state.runId.slice(0, 8)}`,
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildAlertEmbed(state: ICardState): DiscordEmbed {
  return {
    title: `🚨 HARD FAILURE — ${state.taskId}`,
    description: `Task **${state.taskName}** could not be resolved after fallback + diagnostic stages. Manual intervention required.`,
    color: COLOR_FAIL,
    fields: [
      { name: 'Run',       value: `\`${state.runId}\``,       inline: false },
      { name: 'Task',      value: `\`${state.taskId}\``,      inline: true },
      { name: 'Iterations', value: String(state.currentIteration), inline: true },
      { name: 'Workspace', value: `\`${state.workspaceDir}\``, inline: false },
      ...(state.lastError !== undefined ? [{
        name: 'Error',
        value: `\`\`\`${truncate(state.lastError, MAX_ERROR_PREVIEW)}\`\`\``,
        inline: false,
      }] : []),
    ],
    timestamp: new Date().toISOString(),
  };
}

export interface RunSummaryInput {
  readonly runId: string;
  readonly workspaceDir: string;
  readonly totalTasks: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly hardFailures: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalCostUsd: number;
  readonly modelsUsed: readonly string[];
  readonly durationMs: number;
  readonly reportPath: string;
}

export function buildRunSummaryEmbed(s: RunSummaryInput): DiscordEmbed {
  const allPassed = s.failed === 0 && s.hardFailures.length === 0;
  const color = s.hardFailures.length > 0 ? COLOR_FAIL : allPassed ? COLOR_PASS : COLOR_RUNNING;
  const durSec = Math.round(s.durationMs / 1000);

  const fields: DiscordEmbedField[] = [
    {
      name: 'Tasks',
      value: `✅ ${s.passed} completed · ❌ ${s.failed} failed · ⏭ ${s.skipped} skipped`,
      inline: false,
    },
    ...(s.hardFailures.length > 0 ? [{
      name: 'Hard Failures',
      value: s.hardFailures.map((id) => `\`${id}\``).join(', '),
      inline: false,
    }] : []),
    {
      name: 'Tokens',
      value: `${s.inputTokens.toLocaleString()} in / ${s.outputTokens.toLocaleString()} out`,
      inline: true,
    },
    {
      name: 'Cost',
      value: `$${s.totalCostUsd.toFixed(4)}`,
      inline: true,
    },
    {
      name: 'Duration',
      value: `${durSec}s`,
      inline: true,
    },
    ...(s.modelsUsed.length > 0 ? [{
      name: 'Models',
      value: s.modelsUsed.map((m) => `\`${m}\``).join(', '),
      inline: false,
    }] : []),
    { name: 'Report',    value: `\`${s.reportPath}\``,    inline: false },
    { name: 'Workspace', value: `\`${s.workspaceDir}\``, inline: false },
  ];

  return {
    title: `Run complete — ${s.runId.slice(0, 8)}`,
    description: `**${s.passed}/${s.totalTasks}** tasks passed in **${durSec}s** · **$${s.totalCostUsd.toFixed(4)}**`,
    color,
    fields,
    timestamp: new Date().toISOString(),
  };
}
