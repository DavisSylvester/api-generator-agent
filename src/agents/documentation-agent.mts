import type { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import {
  DOCUMENTATION_SYSTEM_PROMPT,
  createDocumentationUserPrompt,
} from '../prompts/documentation.mts';

export interface HoppscotchCollection {
  readonly v: number;
  readonly name: string;
  readonly folders: readonly unknown[];
  readonly requests: readonly unknown[];
}

export class DocumentationAgent extends BaseAgent<string, HoppscotchCollection> {

  constructor(modelChain: ModelChainConfig, ollamaFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super('documentation', modelChain, ollamaFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<string>,
    chatModel: ChatOllama,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<HoppscotchCollection, Error>> {
    this.logger.info(`[docs] Generating Hoppscotch collection from ${input.payload.length} chars of code`);

    const messages = [
      new SystemMessage(DOCUMENTATION_SYSTEM_PROMPT),
      new HumanMessage(createDocumentationUserPrompt(input.payload)),
    ];

    this.logger.info('[docs] Sending code to LLM for documentation generation');
    const response = await chatModel.invoke(messages, traceConfig);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    this.logger.debug(`[docs] LLM response received (${content.length} chars)`);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('[docs] No JSON found in LLM response');
      return err(new Error('No JSON found in documentation response'));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      this.logger.warn('[docs] Failed to parse LLM response as JSON');
      return err(new Error('Failed to parse documentation response as JSON'));
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('v' in parsed) ||
      !('name' in parsed)
    ) {
      this.logger.warn('[docs] Invalid Hoppscotch collection structure');
      return err(new Error('Invalid Hoppscotch collection structure'));
    }

    this.logger.info('[docs] Hoppscotch collection generated successfully');
    return ok(parsed as HoppscotchCollection);
  }
}
