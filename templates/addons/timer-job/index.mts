import { TEMPLATE_TYPE } from "../../../src/core/enums/index.mts";
import type { TemplateType } from "../../../src/core/enums/index.mts";
import type {
  ITemplate,
  IFeatureSpec,
  IGeneratedFile,
  IRenderedFile,
  IValidationResult,
  IGenerationContext,
} from "../../../src/core/interfaces/index.mts";

function renderJobInterface(): string {
  return `export interface IScheduledJob {

  readonly name: string;
  readonly description: string;
  readonly schedule: string;
  readonly enabled: boolean;

  execute(context: IJobContext): Promise<IJobResult>;

  onSuccess(result: IJobResult): Promise<void>;

  onFailure(error: IJobError): Promise<void>;
}

export interface IJobContext {

  jobName: string;
  executionId: string;
  scheduledAt: string;
  startedAt: string;
  metadata: Record<string, unknown>;
}

export interface IJobResult {

  success: boolean;
  jobName: string;
  executionId: string;
  durationMs: number;
  itemsProcessed: number;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface IJobError {

  jobName: string;
  executionId: string;
  error: string;
  stack?: string;
  occurredAt: string;
  willRetry: boolean;
}

export interface IJobScheduleConfig {

  name: string;
  schedule: string;
  enabled: boolean;
  timeoutMs: number;
  retryAttempts: number;
}
`;
}

function renderSchedulerService(): string {
  return `import type { Logger } from "winston";
import type {
  IScheduledJob,
  IJobContext,
  IJobResult,
  IJobError,
} from "../interfaces/i-scheduled-job.mjs";

export interface ISchedulerConfig {

  maxConcurrentJobs: number;
  defaultTimeoutMs: number;
  defaultRetryAttempts: number;
}

const DEFAULT_SCHEDULER_CONFIG: ISchedulerConfig = {
  maxConcurrentJobs: 5,
  defaultTimeoutMs: 300000,
  defaultRetryAttempts: 3,
};

export class SchedulerService {

  private readonly logger: Logger;
  private readonly jobs: Map<string, IScheduledJob>;
  private readonly config: ISchedulerConfig;
  private readonly executionHistory: IJobResult[];
  private isRunning: boolean;

  constructor(logger: Logger, config?: Partial<ISchedulerConfig>) {
    this.logger = logger;
    this.jobs = new Map();
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.executionHistory = [];
    this.isRunning = false;
  }

  public registerJob(job: IScheduledJob): void {
    this.jobs.set(job.name, job);
    this.logger.info(\`[scheduler] Registered job: \${job.name} [\${job.schedule}]\`);
  }

  public unregisterJob(name: string): boolean {
    const removed = this.jobs.delete(name);
    if (removed) {
      this.logger.info(\`[scheduler] Unregistered job: \${name}\`);
    }
    return removed;
  }

  public async executeJob(name: string): Promise<IJobResult> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(\`Job not found: \${name}\`);
    }

    if (!job.enabled) {
      this.logger.warn(\`[scheduler] Job is disabled: \${name}\`);
      return this.buildSkippedResult(name);
    }

    const context = this.buildContext(name);
    return this.runWithErrorHandling(job, context);
  }

  public getRegisteredJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  public getEnabledJobs(): IScheduledJob[] {
    return Array.from(this.jobs.values()).filter((job) => job.enabled);
  }

  public getExecutionHistory(): IJobResult[] {
    return [...this.executionHistory];
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public start(): void {
    this.isRunning = true;
    this.logger.info("[scheduler] Scheduler started");
  }

  public stop(): void {
    this.isRunning = false;
    this.logger.info("[scheduler] Scheduler stopped");
  }

  public getConfig(): ISchedulerConfig {
    return { ...this.config };
  }

  private async runWithErrorHandling(job: IScheduledJob, context: IJobContext): Promise<IJobResult> {
    const startMs = performance.now();

    try {
      this.logger.info(\`[scheduler] Executing job: \${job.name}\`);
      const result = await job.execute(context);
      await job.onSuccess(result);
      this.executionHistory.push(result);
      this.logger.info(\`[scheduler] Job completed: \${job.name} in \${result.durationMs}ms\`);
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startMs);
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const jobError = this.buildJobError(job.name, context.executionId, msg, stack);
      await job.onFailure(jobError);
      return this.buildFailedResult(job.name, context.executionId, durationMs, msg);
    }
  }

  private buildContext(jobName: string): IJobContext {
    const now = new Date().toISOString();
    return {
      jobName,
      executionId: \`exec-\${Date.now()}\`,
      scheduledAt: now,
      startedAt: now,
      metadata: {},
    };
  }

  private buildSkippedResult(name: string): IJobResult {
    return {
      success: false,
      jobName: name,
      executionId: "skipped",
      durationMs: 0,
      itemsProcessed: 0,
      summary: "Job is disabled",
    };
  }

  private buildFailedResult(
    name: string,
    executionId: string,
    durationMs: number,
    error: string,
  ): IJobResult {
    const result: IJobResult = {
      success: false,
      jobName: name,
      executionId,
      durationMs,
      itemsProcessed: 0,
      summary: \`Failed: \${error}\`,
    };
    this.executionHistory.push(result);
    return result;
  }

  private buildJobError(
    jobName: string,
    executionId: string,
    error: string,
    stack?: string,
  ): IJobError {
    return {
      jobName,
      executionId,
      error,
      stack,
      occurredAt: new Date().toISOString(),
      willRetry: false,
    };
  }
}
`;
}

function renderCronConfig(): string {
  return `export interface ICronSchedule {

  name: string;
  expression: string;
  description: string;
  timezone: string;
}

export const COMMON_SCHEDULES = {
  EVERY_MINUTE: "* * * * *",
  EVERY_5_MINUTES: "*/5 * * * *",
  EVERY_15_MINUTES: "*/15 * * * *",
  EVERY_30_MINUTES: "*/30 * * * *",
  EVERY_HOUR: "0 * * * *",
  EVERY_6_HOURS: "0 */6 * * *",
  EVERY_12_HOURS: "0 */12 * * *",
  DAILY_MIDNIGHT: "0 0 * * *",
  DAILY_6AM: "0 6 * * *",
  WEEKLY_MONDAY: "0 0 * * 1",
  MONTHLY_FIRST: "0 0 1 * *",
} as const;

export type CommonSchedule = typeof COMMON_SCHEDULES[keyof typeof COMMON_SCHEDULES];

export function parseCronExpression(expression: string): ICronParts | null {
  const parts = expression.trim().split(/\\s+/);
  if (parts.length !== 5) {
    return null;
  }

  return {
    minute: parts[0] ?? "*",
    hour: parts[1] ?? "*",
    dayOfMonth: parts[2] ?? "*",
    month: parts[3] ?? "*",
    dayOfWeek: parts[4] ?? "*",
  };
}

export interface ICronParts {

  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export function isValidCronExpression(expression: string): boolean {
  return parseCronExpression(expression) !== null;
}

export function describeCronExpression(expression: string): string {
  const parts = parseCronExpression(expression);
  if (!parts) {
    return "Invalid cron expression";
  }

  return buildDescription(parts);
}

function buildDescription(parts: ICronParts): string {
  if (parts.minute === "*" && parts.hour === "*") {
    return "Every minute";
  }

  if (parts.minute.startsWith("*/") && parts.hour === "*") {
    return \`Every \${parts.minute.slice(2)} minutes\`;
  }

  if (parts.minute === "0" && parts.hour === "*") {
    return "Every hour";
  }

  if (parts.minute === "0" && parts.hour.startsWith("*/")) {
    return \`Every \${parts.hour.slice(2)} hours\`;
  }

  if (parts.minute === "0" && parts.hour === "0" && parts.dayOfMonth === "*") {
    return "Daily at midnight";
  }

  return \`At \${parts.minute} \${parts.hour} \${parts.dayOfMonth} \${parts.month} \${parts.dayOfWeek}\`;
}
`;
}

export const template: ITemplate = {
  name: "timer-job",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates a scheduled job pattern: job interface, scheduler service, cron expression config",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "src/jobs/interfaces/i-scheduled-job.mts", description: "Scheduled job interface with execute, onSuccess, onFailure" },
      { path: "src/jobs/service/scheduler-service.mts", description: "Scheduler service with job registration and execution" },
      { path: "src/jobs/config/cron-config.mts", description: "Cron expression config with common schedules and parser" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "src/jobs/interfaces/i-scheduled-job.mts", content: renderJobInterface() },
      { path: "src/jobs/service/scheduler-service.mts", content: renderSchedulerService() },
      { path: "src/jobs/config/cron-config.mts", content: renderCronConfig() },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = [
      "src/jobs/interfaces/i-scheduled-job.mts",
      "src/jobs/service/scheduler-service.mts",
      "src/jobs/config/cron-config.mts",
    ];

    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const jobFile = files.find((f) => f.path.includes("i-scheduled-job"));
    if (jobFile) {
      validateJobInterface(jobFile.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateJobInterface(content: string, errors: string[]): void {
  const requiredTypes = ["IScheduledJob", "IJobContext", "IJobResult"];
  for (const typeName of requiredTypes) {
    if (!content.includes(typeName)) {
      errors.push(`Job interface missing type: ${typeName}`);
    }
  }
}
