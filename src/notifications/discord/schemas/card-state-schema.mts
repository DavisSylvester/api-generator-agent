import { Type } from '@sinclair/typebox';

export const CardStatusSchema = Type.Union([
  Type.Literal('queued'),
  Type.Literal('codegen'),
  Type.Literal('eslint'),
  Type.Literal('qa'),
  Type.Literal('pass'),
  Type.Literal('fail'),
  Type.Literal('hard-fail'),
]);

export const CardStepSchema = Type.Object({
  name: Type.String(),
  durationMs: Type.Optional(Type.Number()),
  ok: Type.Optional(Type.Boolean()),
  detail: Type.Optional(Type.String()),
});

export const CardStateSchema = Type.Object({
  runId: Type.String(),
  taskId: Type.String(),
  taskName: Type.String(),
  taskType: Type.String(),
  status: CardStatusSchema,
  iterations: Type.Number(),
  currentIteration: Type.Number(),
  steps: Type.Array(CardStepSchema),
  model: Type.Optional(Type.String()),
  inputTokens: Type.Number(),
  outputTokens: Type.Number(),
  taskCostUsd: Type.Number(),
  runCostUsd: Type.Number(),
  startedAt: Type.Number(),
  finishedAt: Type.Optional(Type.Number()),
  lastError: Type.Optional(Type.String()),
  threadId: Type.String(),
  messageId: Type.String(),
  workspaceDir: Type.String(),
});

export const PersistedCardsSchema = Type.Object({
  runId: Type.String(),
  threadId: Type.String(),
  transport: Type.Union([Type.Literal('webhook'), Type.Literal('bot')]),
  tasks: Type.Record(Type.String(), CardStateSchema),
});
