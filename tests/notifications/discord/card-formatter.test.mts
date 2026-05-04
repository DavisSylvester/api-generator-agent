import { describe, test, expect } from 'bun:test';
import { buildCardEmbed, buildAlertEmbed, buildRunSummaryEmbed } from '../../../src/notifications/discord/card-formatter.mts';
import type { ICardState } from '../../../src/notifications/discord/interfaces/i-card-state.mts';

const baseState = (overrides: Partial<ICardState> = {}): ICardState => ({
  runId: '11111111-2222-3333-4444-555555555555',
  taskId: 'user-endpoint',
  taskName: 'User Endpoint',
  taskType: 'endpoint',
  status: 'codegen',
  iterations: 5,
  currentIteration: 2,
  steps: [],
  inputTokens: 1000,
  outputTokens: 500,
  taskCostUsd: 0.0123,
  runCostUsd: 0.4567,
  startedAt: 1700000000000,
  threadId: 'thread-123',
  messageId: 'msg-456',
  workspaceDir: '.workspace',
  ...overrides,
});

describe('buildCardEmbed', () => {

  test('uses running color for in-progress states', () => {
    expect(buildCardEmbed(baseState({ status: 'codegen' })).color).toBe(0xFFAA00);
    expect(buildCardEmbed(baseState({ status: 'eslint' })).color).toBe(0xFFAA00);
    expect(buildCardEmbed(baseState({ status: 'qa' })).color).toBe(0xFFAA00);
  });

  test('uses pass color for pass', () => {
    expect(buildCardEmbed(baseState({ status: 'pass' })).color).toBe(0x2ECC71);
  });

  test('uses fail color for fail and hard-fail', () => {
    expect(buildCardEmbed(baseState({ status: 'fail' })).color).toBe(0xE74C3C);
    expect(buildCardEmbed(baseState({ status: 'hard-fail' })).color).toBe(0xE74C3C);
  });

  test('embeds tokens, cost, and runId fields', () => {
    const embed = buildCardEmbed(baseState({ model: 'qwen3-coder-next' }));
    const fieldNames = embed.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Tokens');
    expect(fieldNames).toContain('Cost');
    expect(fieldNames).toContain('Run');
    expect(fieldNames).toContain('Workspace');
    expect(fieldNames).toContain('Model');
  });

  test('truncates long error to fit field limit', () => {
    const longError = 'X'.repeat(2000);
    const embed = buildCardEmbed(baseState({ status: 'fail', lastError: longError }));
    const errField = embed.fields?.find((f) => f.name === 'Last Error');
    expect(errField).toBeDefined();
    // 1024 max field value, but we wrap in ```...``` so usable space is ~1014.
    expect(errField!.value.length).toBeLessThanOrEqual(1024);
  });

  test('records steps with codegen/eslint/qa fields', () => {
    const embed = buildCardEmbed(baseState({
      steps: [
        { name: 'codegen', durationMs: 1400, ok: true, detail: '5 files' },
        { name: 'eslint',  durationMs: 300,  ok: true },
        { name: 'qa',      durationMs: 8200, ok: false, detail: '3 errors' },
      ],
    }));
    const names = embed.fields?.map((f) => f.name) ?? [];
    expect(names).toContain('Codegen');
    expect(names).toContain('ESLint');
    expect(names).toContain('QA');
  });
});

describe('buildAlertEmbed', () => {
  test('uses fail color and includes runId + taskId + error', () => {
    const embed = buildAlertEmbed(baseState({
      status: 'hard-fail',
      lastError: 'something broke catastrophically',
    }));
    expect(embed.color).toBe(0xE74C3C);
    expect(embed.title).toContain('HARD FAILURE');
    const fieldNames = embed.fields?.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('Run');
    expect(fieldNames).toContain('Task');
    expect(fieldNames).toContain('Error');
  });
});

describe('buildRunSummaryEmbed', () => {
  test('green when no failures, red when hard failures, yellow otherwise', () => {
    const base = {
      runId: 'run-1',
      workspaceDir: '.workspace/run-1',
      totalTasks: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      hardFailures: [] as readonly string[],
      inputTokens: 1000,
      outputTokens: 500,
      totalCostUsd: 1.23,
      modelsUsed: ['qwen3-coder-next'],
      durationMs: 60_000,
      reportPath: '.workspace/run-1/report.md',
    };
    expect(buildRunSummaryEmbed(base).color).toBe(0x2ECC71);
    expect(buildRunSummaryEmbed({ ...base, hardFailures: ['x'] }).color).toBe(0xE74C3C);
    expect(buildRunSummaryEmbed({ ...base, passed: 5, failed: 5 }).color).toBe(0xFFAA00);
  });
});
