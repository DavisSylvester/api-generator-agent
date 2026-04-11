import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { tokenTracker } from './token-tracker.mts';

export interface StreamInvokeOptions {
  readonly model?: string;
  readonly taskId?: string;
}

export async function streamInvoke(
  chatModel: BaseChatModel,
  messages: readonly BaseMessage[],
  traceConfig: Record<string, unknown>,
  options?: StreamInvokeOptions,
): Promise<string> {
  const stream = await chatModel.stream([...messages], traceConfig);
  const chunks: string[] = [];
  let lastChunkMeta: Record<string, unknown> | undefined;

  for await (const chunk of stream) {
    const text = typeof chunk.content === 'string'
      ? chunk.content
      : JSON.stringify(chunk.content);
    chunks.push(text);
    // Capture metadata from last chunk (often contains usage info)
    if (chunk.response_metadata && Object.keys(chunk.response_metadata).length > 0) {
      lastChunkMeta = chunk.response_metadata as Record<string, unknown>;
    }
    if (chunk.usage_metadata) {
      lastChunkMeta = { ...lastChunkMeta, usage_metadata: chunk.usage_metadata };
    }
  }

  const raw = chunks.join(``);

  // Track token usage
  const modelName = options?.model ?? `unknown`;
  const promptChars = messages.map((m) => typeof m.content === `string` ? m.content.length : 0).reduce((a, b) => a + b, 0);
  const completionChars = raw.length;

  // Try to extract real token counts from response metadata
  const usageMeta = lastChunkMeta?.usage_metadata as Record<string, number> | undefined;
  const usage = lastChunkMeta?.usage as Record<string, number> | undefined;

  if (usageMeta?.input_tokens && usageMeta?.output_tokens) {
    tokenTracker.record(modelName, {
      promptTokens: usageMeta.input_tokens,
      completionTokens: usageMeta.output_tokens,
      totalTokens: (usageMeta.input_tokens + usageMeta.output_tokens),
    }, options?.taskId);
  } else if (usage?.prompt_tokens && usage?.completion_tokens) {
    tokenTracker.record(modelName, {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: (usage.prompt_tokens + usage.completion_tokens),
    }, options?.taskId);
  } else {
    // Fallback: estimate from char counts
    tokenTracker.recordEstimate(modelName, promptChars, completionChars, options?.taskId);
  }

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

  return cleaned;
}
