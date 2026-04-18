import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';
import { PRD_EXPANSION_SYSTEM_PROMPT, createPrdExpansionUserPrompt } from '../prompts/prd-expansion.mts';
import { streamInvokeWithUsage } from '../llm/stream-invoke.mts';

const REQUIRED_SECTIONS = [
  '## Overview',
  '## Stack',
  '## Entities',
  '## Endpoints',
  '## Validation',
  '## Non-Functional Requirements',
] as const;

export class PrdExpansionAgent extends BaseAgent<string, string> {

  constructor(modelChain: ModelChainConfig, llmFactory: ILlmFactory, logger: Logger, timeoutMs?: number) {
    super('prd-expansion', modelChain, llmFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<string>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<string, Error>> {
    this.logger.info(`[prd-expansion] Expanding user prompt (${input.payload.length} chars) into structured PRD`);

    const messages = [
      new SystemMessage(PRD_EXPANSION_SYSTEM_PROMPT),
      new HumanMessage(createPrdExpansionUserPrompt(input.payload)),
    ];

    const streamResult = await streamInvokeWithUsage(chatModel, messages, traceConfig);
    this._lastTokenUsage = { inputTokens: streamResult.inputTokens, outputTokens: streamResult.outputTokens };

    let content = streamResult.content.trim();

    // Strip wrapping code fences if the LLM ignored the instruction.
    const fenced = /^```(?:markdown|md)?\s*\n([\s\S]+?)\n?```\s*$/.exec(content);
    if (fenced?.[1]) {
      content = fenced[1].trim();
      this.logger.info(`[prd-expansion] Stripped wrapping code fences from generated PRD`);
    }

    if (!content.startsWith(`#`)) {
      this.logger.warn(`[prd-expansion] PRD does not start with a heading — first 200 chars: ${content.slice(0, 200)}`);
      return err(new Error(`Generated PRD does not start with a heading`));
    }

    const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s));
    if (missing.length > 0) {
      this.logger.warn(`[prd-expansion] Generated PRD missing required sections: ${missing.join(`, `)}`);
      return err(new Error(`Generated PRD missing required sections: ${missing.join(`, `)}`));
    }

    this.logger.info(`[prd-expansion] PRD generated (${content.length} chars)`);
    return ok(content);
  }
}
