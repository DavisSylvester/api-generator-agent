import type { AgentRole } from '../config/models.mts';

export interface TraceMetadata {
  readonly runId: string;
  readonly agentRole: AgentRole;
  readonly taskId?: string;
  readonly model: string;
  readonly iteration: number;
}

export function createTraceConfig(metadata: TraceMetadata): Record<string, unknown> {
  return {
    tags: [
      `role:${metadata.agentRole}`,
      `model:${metadata.model}`,
      `run:${metadata.runId}`,
      ...(metadata.taskId ? [`task:${metadata.taskId}`] : []),
      `iter:${metadata.iteration}`,
    ],
    metadata: {
      runId: metadata.runId,
      agentRole: metadata.agentRole,
      taskId: metadata.taskId,
      model: metadata.model,
      iteration: metadata.iteration,
    },
    runName: `${metadata.agentRole}/${metadata.model}`,
  };
}
