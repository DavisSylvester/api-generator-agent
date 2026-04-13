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
  readonly resumeRunId?: string;
  readonly skipDiagrams?: boolean;
  readonly skipDocs?: boolean;
  readonly skipValidation?: boolean;
}

export interface PipelineResult {
  readonly runId: string;
  readonly taskStates: readonly TaskState[];
  readonly documentationGenerated: boolean;
  readonly durationMs: number;
  readonly featuresJsonPath?: string;
  readonly sessionHandoffPath?: string;
  readonly validationScreenshotPath?: string;
}
