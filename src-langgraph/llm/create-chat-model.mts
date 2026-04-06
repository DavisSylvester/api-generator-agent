import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ModelChainConfig } from '../config/models.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { ThinkingSpinner } from './thinking-spinner.mts';
import { withTimeout, LlmTimeoutError } from './with-timeout.mts';

export interface LlmMessage {
  readonly role: 'system' | 'user';
  readonly content: string;
}

const DEFAULT_TIMEOUT_MS = 1800000;

export async function invokeWithFallback(
  host: string,
  modelChain: ModelChainConfig,
  messages: readonly LlmMessage[],
  traceMetadata: Record<string, unknown>,
): Promise<Result<{ content: string; modelUsed: string }, Error>> {
  const errors: string[] = [];
  const role = String(traceMetadata['agentRole'] ?? 'unknown');
  const timeoutMs = Number(Bun.env['LLM_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS);

  const langchainMessages = messages.map((m) =>
    m.role === 'system' ? new SystemMessage(m.content) : new HumanMessage(m.content),
  );

  console.log(`[${role}] Starting LLM invocation — ${modelChain.models.length} models in fallback chain (timeout: ${Math.round(timeoutMs / 1000)}s)`);

  for (const model of modelChain.models) {
    console.log(`[${role}] Trying model: ${model} (temperature: ${modelChain.temperature})`);
    const spinner = new ThinkingSpinner(`${role}:${model}`);
    spinner.start();

    try {
      const chatModel = new ChatOllama({
        baseUrl: host,
        model,
        temperature: modelChain.temperature,
      });

      const response = await withTimeout(
        chatModel.invoke(langchainMessages, {
          tags: traceMetadata['tags'] as string[] | undefined,
          metadata: traceMetadata,
          runName: `${role}/${model}`,
        }),
        model,
        timeoutMs,
      );

      const content = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      spinner.stop(`Done — ${model} (${content.length} chars)`);

      return ok({ content, modelUsed: model });
    } catch (e) {
      const isTimeout = e instanceof LlmTimeoutError;
      const errorMsg = e instanceof Error ? e.message : String(e);
      errors.push(`${model}: ${errorMsg}`);
      spinner.stop(isTimeout ? `TIMEOUT — ${model} (${Math.round(timeoutMs / 1000)}s limit)` : `Failed — ${model}: ${errorMsg}`);
      if (isTimeout) {
        console.warn(`[${role}] Moving to next model in fallback chain`);
      }
    }
  }

  console.error(`[${role}] All models failed`);
  return err(new Error(
    `All models failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
  ));
}
