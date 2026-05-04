import type { Logger } from 'winston';
import type {
  IDiscordTransport,
  DiscordMessagePayload,
  AlertPayload,
} from './interfaces/i-discord-transport.mjs';

export interface WebhookTransportConfig {
  readonly pipelineWebhookUrl: string;
  readonly alertWebhookUrl: string | undefined;
  readonly logger: Logger;
}

interface DiscordPostResponse {
  readonly id: string;
  readonly channel_id?: string;
  readonly guild_id?: string;
}

const MAX_RETRIES = 3;

// Forum-channel webhook transport.
//
// Thread-per-run requires the configured channel to be a Discord forum channel.
// startThread() posts with `thread_name`, which Discord interprets as "create
// a new forum post (thread) and put this message in it." The response carries
// the new thread/channel id so subsequent posts target it via `?thread_id=`.
//
// All requests use ?wait=true so we get the message id back for editing.
export class WebhookTransport implements IDiscordTransport {

  public readonly kind = 'webhook' as const;
  private readonly pipelineUrl: string;
  private readonly alertUrl: string | undefined;
  private readonly logger: Logger;
  private healthy: boolean = true;
  private guildIdCache: string | undefined;

  constructor(config: WebhookTransportConfig) {
    this.pipelineUrl = config.pipelineWebhookUrl;
    this.alertUrl = config.alertWebhookUrl;
    this.logger = config.logger;
  }

  public async startThread(runId: string, summary: string): Promise<{ readonly threadId: string }> {
    const url = `${this.pipelineUrl}?wait=true`;
    const body = {
      content: summary,
      thread_name: `run-${runId.slice(0, 8)}`,
    };

    const response = await this.request<DiscordPostResponse>(url, 'POST', body);
    if (response === undefined) {
      throw new Error('Failed to start Discord thread (transport unhealthy)');
    }
    if (response.channel_id === undefined) {
      throw new Error('Discord webhook did not return a thread/channel id — is the target a forum channel?');
    }
    if (response.guild_id !== undefined) {
      this.guildIdCache = response.guild_id;
    }
    return { threadId: response.channel_id };
  }

  public async postCard(threadId: string, payload: DiscordMessagePayload): Promise<{ readonly messageId: string }> {
    const url = `${this.pipelineUrl}?wait=true&thread_id=${encodeURIComponent(threadId)}`;
    const response = await this.request<DiscordPostResponse>(url, 'POST', payload);
    if (response === undefined) {
      throw new Error('Failed to post card (transport unhealthy)');
    }
    if (response.guild_id !== undefined) {
      this.guildIdCache = response.guild_id;
    }
    return { messageId: response.id };
  }

  public async editCard(threadId: string, messageId: string, payload: DiscordMessagePayload): Promise<void> {
    const url = `${this.pipelineUrl}/messages/${encodeURIComponent(messageId)}?thread_id=${encodeURIComponent(threadId)}`;
    await this.request<DiscordPostResponse>(url, 'PATCH', payload);
  }

  public async postSummary(threadId: string, payload: DiscordMessagePayload): Promise<{ readonly messageId: string }> {
    return this.postCard(threadId, payload);
  }

  public async postAlert(payload: AlertPayload): Promise<void> {
    const target = this.alertUrl ?? this.pipelineUrl;
    const url = `${target}?wait=true`;

    const description = payload.threadDeepLink !== undefined
      ? `${payload.embed.description ?? ''}\n\n[Open run thread](${payload.threadDeepLink})`
      : payload.embed.description;

    const body: DiscordMessagePayload = {
      content: payload.mention,
      embeds: [{ ...payload.embed, description }],
      allowed_mentions: payload.mention !== undefined
        ? { parse: ['users', 'roles'] }
        : undefined,
    };

    await this.request<DiscordPostResponse>(url, 'POST', body);
  }

  public async health(): Promise<boolean> {
    return this.healthy;
  }

  public guildId(): string | undefined {
    return this.guildIdCache;
  }

  private async request<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T | undefined> {
    if (!this.healthy) return undefined;

    let attempt = 0;
    let backoffMs = 250;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '1');
          const waitMs = Math.max(retryAfter * 1000, backoffMs);
          this.logger.warn(`[discord] 429 rate-limited, retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          backoffMs *= 2;
          continue;
        }

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          this.logger.warn(`[discord] HTTP ${response.status} from ${method} (attempt ${attempt}/${MAX_RETRIES}): ${text.slice(0, 200)}`);
          if (response.status >= 500) {
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            backoffMs *= 2;
            continue;
          }
          // 4xx other than 429 — not retryable. Mark unhealthy after a few of these.
          if (response.status === 401 || response.status === 404) {
            this.healthy = false;
            this.logger.error(`[discord] webhook unauthorized or missing — disabling transport`);
          }
          return undefined;
        }

        if (method === 'PATCH') {
          // Edits sometimes return empty body — try parse but don't fail on it.
          const text = await response.text();
          if (text.length === 0) return undefined;
          try {
            return JSON.parse(text) as T;
          } catch {
            return undefined;
          }
        }

        return await response.json() as T;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[discord] network error: ${msg} (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs *= 2;
      }
    }

    this.logger.error(`[discord] giving up after ${MAX_RETRIES} attempts`);
    return undefined;
  }
}
