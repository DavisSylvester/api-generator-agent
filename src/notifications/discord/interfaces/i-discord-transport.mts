import type { DiscordTransportKind } from './i-discord-config.mjs';

export interface DiscordEmbedField {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

export interface DiscordEmbedFooter {
  readonly text: string;
}

export interface DiscordEmbed {
  readonly title?: string;
  readonly description?: string;
  readonly color?: number;
  readonly fields?: readonly DiscordEmbedField[];
  readonly footer?: DiscordEmbedFooter;
  readonly timestamp?: string;
}

export interface DiscordMessagePayload {
  readonly content?: string;
  readonly embeds?: readonly DiscordEmbed[];
  readonly allowed_mentions?: {
    readonly parse?: readonly ('users' | 'roles' | 'everyone')[];
    readonly users?: readonly string[];
    readonly roles?: readonly string[];
  };
}

export interface AlertPayload {
  readonly mention: string | undefined;
  readonly embed: DiscordEmbed;
  readonly threadDeepLink: string | undefined;
}

export interface IDiscordTransport {

  readonly kind: DiscordTransportKind;
  startThread(runId: string, summary: string): Promise<{ readonly threadId: string }>;
  postCard(threadId: string, payload: DiscordMessagePayload): Promise<{ readonly messageId: string }>;
  editCard(threadId: string, messageId: string, payload: DiscordMessagePayload): Promise<void>;
  postSummary(threadId: string, payload: DiscordMessagePayload): Promise<{ readonly messageId: string }>;
  postAlert(payload: AlertPayload): Promise<void>;
  health(): Promise<boolean>;
}
