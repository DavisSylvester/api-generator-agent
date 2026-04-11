export interface IToolUse {
  toolName: string;
  callCount: number;
  totalDurationMs: number;
}

export interface ITraceError {
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  context: Record<string, unknown>;
}

export interface ITraceEntry {
  traceId: string;
  sessionId: string;
  featureName: string;
  stepName: string;
  iteration: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "success" | "failed" | "skipped";
  toolUses: IToolUse[];
  tokenConsumption: {
    prompt: number;
    completion: number;
    total: number;
  };
  result: {
    filesGenerated: string[];
    filesModified: string[];
    linesOfCode: number;
    summary: string;
  };
  errors: ITraceError[];
  documentation: string;
}
