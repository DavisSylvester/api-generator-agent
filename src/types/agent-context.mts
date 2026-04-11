export interface AgentInput<T> {
  readonly runId: string;
  readonly taskId?: string;
  readonly payload: T;
  readonly iteration: number;
}

export interface AgentOutput<T> {
  readonly runId: string;
  readonly taskId?: string;
  readonly payload: T;
  readonly modelUsed: string;
  readonly durationMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly traceId?: string;
}
