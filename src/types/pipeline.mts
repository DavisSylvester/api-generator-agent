import type { TaskState } from './task.mts';
import type { LlmProvider } from '../config/env.mjs';

export interface PipelineConfig {
  readonly maxFixIterations: number;
  readonly maxConcurrency: number;
  readonly workspaceDir: string;
  readonly llmProvider: LlmProvider;
  readonly llmProviderHost?: string;
  readonly maxTasks?: number;
  readonly integrationPort: number;
  readonly taskCostLimit: number;
}

export interface PipelineResult {
  readonly runId: string;
  readonly taskStates: readonly TaskState[];
  readonly documentationGenerated: boolean;
  readonly durationMs: number;
}
