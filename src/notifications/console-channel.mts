import type { Logger } from 'winston';
import type { NotificationChannel, PipelineEvent } from './notifier.mts';

export class ConsoleChannel implements NotificationChannel {

  public readonly name = `console`;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async send(event: PipelineEvent): Promise<void> {
    const prefix = `[notify]`;

    switch (event.type) {
      case `task_passed`:
        this.logger.info(`${prefix} ✓ ${event.taskId} passed (iter ${event.iteration})`);
        break;
      case `task_failed`:
        this.logger.warn(`${prefix} ✗ ${event.taskId} failed: ${event.message}`);
        break;
      case `circuit_break`:
        this.logger.warn(`${prefix} ⚡ CIRCUIT BREAK: ${event.taskId} — ${event.message}`);
        break;
      case `fallback_escalation`:
        this.logger.info(`${prefix} 🔀 Escalating ${event.taskId} to ${event.model}`);
        break;
      case `fallback_success`:
        this.logger.info(`${prefix} 🎯 ${event.taskId} SAVED by ${event.model}`);
        break;
      case `hard_failure`:
        this.logger.error(`${prefix} 🚨 HARD FAILURE: ${event.taskId} — ${event.message}`);
        break;
      case `pipeline_complete`:
        this.logger.info(`${prefix} 🏁 Pipeline complete: ${event.message}`);
        break;
      case `status_update`:
        this.logger.info(`${prefix} 📊 ${event.message}`);
        break;
      default:
        this.logger.info(`${prefix} ${event.message}`);
    }
  }

  public async sendBatch(events: readonly PipelineEvent[]): Promise<void> {
    for (const event of events) {
      await this.send(event);
    }
  }
}
