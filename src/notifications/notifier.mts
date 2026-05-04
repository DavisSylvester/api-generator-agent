export interface PipelineEvent {
  readonly type: 'task_started' | 'task_passed' | 'task_failed' | 'circuit_break' | 'fallback_escalation' | 'fallback_success' | 'hard_failure' | 'pipeline_complete' | 'status_update';
  readonly runId?: string;
  readonly taskId?: string;
  readonly taskName?: string;
  readonly message: string;
  readonly iteration?: number;
  readonly model?: string;
  readonly passed?: number;
  readonly failed?: number;
  readonly total?: number;
  readonly durationMs?: number;
  readonly timestamp: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(event: PipelineEvent): Promise<void>;
  sendBatch(events: readonly PipelineEvent[]): Promise<void>;
  setProjectName?(name: string): void;
}

export interface NotifierConfig {
  readonly channels: readonly NotificationChannel[];
  readonly statusIntervalMs: number;
  readonly notifyOn: {
    readonly taskPassed: boolean;
    readonly taskFailed: boolean;
    readonly circuitBreak: boolean;
    readonly fallbackEscalation: boolean;
    readonly fallbackSuccess: boolean;
    readonly hardFailure: boolean;
    readonly pipelineComplete: boolean;
    readonly statusUpdate: boolean;
  };
}

const DEFAULT_CONFIG: NotifierConfig = {
  channels: [],
  statusIntervalMs: 300000, // 5 minutes
  notifyOn: {
    taskPassed: false,
    taskFailed: true,
    circuitBreak: true,
    fallbackEscalation: true,
    fallbackSuccess: true,
    hardFailure: true,
    pipelineComplete: true,
    statusUpdate: true,
  },
};

export class Notifier {

  private readonly config: NotifierConfig;
  private readonly eventQueue: PipelineEvent[] = [];
  private statusInterval: ReturnType<typeof setInterval> | undefined;
  private passedCount = 0;
  private failedCount = 0;
  private totalCount = 0;
  private startMs = 0;

  constructor(config?: Partial<NotifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, notifyOn: { ...DEFAULT_CONFIG.notifyOn, ...config?.notifyOn } };
  }

  public setProjectName(name: string): void {
    for (const channel of this.config.channels) {
      channel.setProjectName?.(name);
    }
  }

  public start(totalTasks: number): void {
    this.totalCount = totalTasks;
    this.startMs = performance.now();

    if (this.config.notifyOn.statusUpdate && this.config.statusIntervalMs > 0 && this.config.channels.length > 0) {
      this.statusInterval = setInterval(() => {
        this.sendStatusUpdate();
      }, this.config.statusIntervalMs);
    }
  }

  public stop(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = undefined;
    }
  }

  public async notify(event: PipelineEvent): Promise<void> {
    // Track counts
    if (event.type === `task_passed`) this.passedCount++;
    if (event.type === `task_failed` || event.type === `hard_failure`) this.failedCount++;

    // Check if this event type should be notified
    const shouldNotify = this.shouldNotify(event.type);
    if (!shouldNotify) return;

    for (const channel of this.config.channels) {
      try {
        await channel.send(event);
      } catch {
        // Don't let notification failures break the pipeline
      }
    }
  }

  private shouldNotify(type: PipelineEvent['type']): boolean {
    switch (type) {
      case `task_passed`: return this.config.notifyOn.taskPassed;
      case `task_failed`: return this.config.notifyOn.taskFailed;
      case `circuit_break`: return this.config.notifyOn.circuitBreak;
      case `fallback_escalation`: return this.config.notifyOn.fallbackEscalation;
      case `fallback_success`: return this.config.notifyOn.fallbackSuccess;
      case `hard_failure`: return this.config.notifyOn.hardFailure;
      case `pipeline_complete`: return this.config.notifyOn.pipelineComplete;
      case `status_update`: return this.config.notifyOn.statusUpdate;
      default: return false;
    }
  }

  private async sendStatusUpdate(): Promise<void> {
    const elapsed = Math.round((performance.now() - this.startMs) / 1000);
    const remaining = this.totalCount - this.passedCount - this.failedCount;

    const event: PipelineEvent = {
      type: `status_update`,
      message: `${this.passedCount}/${this.totalCount} passed, ${this.failedCount} failed, ${remaining} remaining (${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed)`,
      passed: this.passedCount,
      failed: this.failedCount,
      total: this.totalCount,
      durationMs: Math.round(performance.now() - this.startMs),
      timestamp: new Date().toISOString(),
    };

    for (const channel of this.config.channels) {
      try {
        await channel.send(event);
      } catch {
        // Silent
      }
    }
  }
}
