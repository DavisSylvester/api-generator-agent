import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import type { Logger } from 'winston';
import { retryWithBackoff, type RetryConfig } from './retry-with-backoff.mts';

export interface StreamInvokeResult {
  readonly content: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface StreamInvokeOptions {
  readonly logger?: Logger;
  readonly retryConfig?: RetryConfig;
}

export async function streamInvoke(
  chatModel: BaseChatModel,
  messages: readonly BaseMessage[],
  traceConfig: Record<string, unknown>,
  options?: StreamInvokeOptions,
): Promise<string> {
  const result = await streamInvokeWithUsage(chatModel, messages, traceConfig, options);
  return result.content;
}

export async function streamInvokeWithUsage(
  chatModel: BaseChatModel,
  messages: readonly BaseMessage[],
  traceConfig: Record<string, unknown>,
  options?: StreamInvokeOptions,
): Promise<StreamInvokeResult> {
  const executeStream = async (): Promise<StreamInvokeResult> => {
    return executeStreamInvoke(chatModel, messages, traceConfig);
  };

  if (options?.logger) {
    const label = typeof traceConfig["run_name"] === "string" ? traceConfig["run_name"] : "stream-invoke";
    return retryWithBackoff(executeStream, options.logger, label, options.retryConfig);
  }

  return executeStream();
}

async function executeStreamInvoke(
  chatModel: BaseChatModel,
  messages: readonly BaseMessage[],
  traceConfig: Record<string, unknown>,
): Promise<StreamInvokeResult> {
  const stream = await chatModel.stream([...messages], traceConfig);
  const chunks: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const text = typeof chunk.content === 'string'
      ? chunk.content
      : JSON.stringify(chunk.content);
    chunks.push(text);

    // Extract token usage from chunk metadata if available
    const usage = (chunk as AIMessageChunk).usage_metadata;
    if (usage) {
      inputTokens = usage.input_tokens ?? inputTokens;
      outputTokens = usage.output_tokens ?? outputTokens;
    }
  }

  const raw = chunks.join('');

  // Strip <think>...</think> blocks that qwen3.5 and similar models produce.
  // Handle: multiple blocks, attributes on the tag, and unclosed tags (model cut off mid-think).
  let cleaned = raw
    .replace(/<think[^>]*>[\s\S]*?<\/think>/g, ``)  // closed think blocks (with optional attributes)
    .trim();

  // Only strip unclosed trailing think block if there's still an opening tag AND
  // there's meaningful content before it (don't eat the entire response)
  if (cleaned.includes(`<think`)) {
    const thinkStart = cleaned.lastIndexOf(`<think`);
    const beforeThink = cleaned.substring(0, thinkStart).trim();
    // Only strip if there's content before the unclosed think tag
    if (beforeThink.length > 0) {
      cleaned = beforeThink;
    }
  }

  return { content: cleaned, inputTokens, outputTokens };
}
