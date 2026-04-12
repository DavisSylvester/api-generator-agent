import type { NotificationChannel, PipelineEvent } from './notifier.mts';

export interface TelegramConfig {
  readonly botToken: string;
  readonly chatId: string;
}

const EMOJI_MAP: Record<PipelineEvent['type'], string> = {
  task_started: `🔄`,
  task_passed: `✅`,
  task_failed: `❌`,
  circuit_break: `⚡`,
  fallback_escalation: `🔀`,
  fallback_success: `🎯`,
  hard_failure: `🚨`,
  pipeline_complete: `🏁`,
  status_update: `📊`,
};

function formatEvent(event: PipelineEvent): string {
  const emoji = EMOJI_MAP[event.type] ?? `📌`;
  const parts: string[] = [`${emoji} *${event.type.replace(/_/g, ` `).toUpperCase()}*`];

  if (event.taskId) {
    parts.push(`Task: \`${event.taskId}\``);
  }

  parts.push(event.message);

  if (event.model) {
    parts.push(`Model: ${event.model}`);
  }

  if (event.iteration !== undefined) {
    parts.push(`Iteration: ${event.iteration}`);
  }

  if (event.passed !== undefined && event.total !== undefined) {
    const bar = renderProgressBar(event.passed, event.failed ?? 0, event.total);
    parts.push(bar);
  }

  return parts.join(`\n`);
}

function renderProgressBar(passed: number, failed: number, total: number): string {
  const width = 20;
  const passedBlocks = Math.round((passed / total) * width);
  const failedBlocks = Math.round((failed / total) * width);
  const remaining = width - passedBlocks - failedBlocks;

  return `[${'█'.repeat(passedBlocks)}${'▓'.repeat(failedBlocks)}${'░'.repeat(Math.max(0, remaining))}] ${passed}/${total}`;
}

export class TelegramChannel implements NotificationChannel {

  public readonly name = `telegram`;
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly apiBase: string;

  constructor(config: TelegramConfig) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  public async send(event: PipelineEvent): Promise<void> {
    const text = formatEvent(event);
    await this.sendMessage(text);
  }

  public async sendBatch(events: readonly PipelineEvent[]): Promise<void> {
    if (events.length === 0) return;

    const combined = events.map(formatEvent).join(`\n\n---\n\n`);
    await this.sendMessage(combined);
  }

  private async sendMessage(text: string): Promise<void> {
    const url = `${this.apiBase}/sendMessage`;

    const response = await fetch(url, {
      method: `POST`,
      headers: { 'Content-Type': `application/json` },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: `Markdown`,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error ${response.status}: ${body}`);
    }
  }
}
