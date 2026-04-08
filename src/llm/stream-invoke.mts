import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';

export async function streamInvoke(
  chatModel: BaseChatModel,
  messages: readonly BaseMessage[],
  traceConfig: Record<string, unknown>,
): Promise<string> {
  const stream = await chatModel.stream([...messages], traceConfig);
  const chunks: string[] = [];

  for await (const chunk of stream) {
    const text = typeof chunk.content === 'string'
      ? chunk.content
      : JSON.stringify(chunk.content);
    chunks.push(text);
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

  return cleaned;
}
