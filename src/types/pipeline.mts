import type { TaskState } from './task.mts';

export interface PipelineConfig {
  readonly maxFixIterations: number;
  readonly maxConcurrency: number;
  readonly workspaceDir: string;
  readonly ollamaHost: string;
  readonly maxTasks?: number;
  readonly integrationPort: number;
}

export interface PipelineResult {
  readonly runId: string;
  readonly taskStates: readonly TaskState[];
  readonly documentationGenerated: boolean;
  readonly durationMs: number;
}
