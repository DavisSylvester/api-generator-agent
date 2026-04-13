import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Logger } from 'winston';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { AgentRole, ModelChainConfig } from '../config/models.mts';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';
import { FLUTTER_UI_SYSTEM_PROMPT } from '../prompts/flutter-ui-system-prompt.mts';
import { createFlutterUiUserPrompt } from '../prompts/flutter-ui-user-prompt.mts';
import type { FlutterScreenTask } from '../prompts/flutter-ui-user-prompt.mts';
import { streamInvokeWithUsage } from '../llm/stream-invoke.mts';

export interface FlutterUiInput {
  readonly task: FlutterScreenTask;
  readonly prdText: string;
  readonly apiEndpointReference: string;
  readonly existingCode?: string;
  readonly errors?: string;
}

export interface FlutterCodeFile {
  readonly path: string;
  readonly content: string;
}

export interface FlutterUiOutput {
  readonly files: readonly FlutterCodeFile[];
  readonly screenId: string;
}

export class FlutterUiAgent extends BaseAgent<FlutterUiInput, FlutterUiOutput> {

  constructor(
    modelChain: ModelChainConfig,
    llmFactory: ILlmFactory,
    logger: Logger,
    timeoutMs: number = 1800000,
  ) {
    super(`codegen` as AgentRole, modelChain, llmFactory, logger, timeoutMs, false);
  }

  protected async execute(
    input: AgentInput<FlutterUiInput>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<FlutterUiOutput, Error>> {
    const { task, prdText, apiEndpointReference, existingCode, errors } = input.payload;

    const userPrompt = createFlutterUiUserPrompt(task, prdText, apiEndpointReference, existingCode, errors);

    const messages = [
      new SystemMessage(FLUTTER_UI_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ];

    const response = await streamInvokeWithUsage(chatModel, messages, traceConfig, { logger: this.logger });
    const content = response.content;

    if (!content || typeof content !== `string` || content.trim().length === 0) {
      return err(new Error(`Empty response from LLM for screen ${task.screenId}`));
    }

    this._lastTokenUsage = {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };

    const files = parseFlutterCodeBlocks(content);

    if (files.length === 0) {
      return err(new Error(`No code blocks found in response for screen ${task.screenId}`));
    }

    this.logger.info(`[flutter-ui] Generated ${files.length} files for ${task.screenId}`);

    return ok({ files, screenId: task.screenId });
  }
}

function parseFlutterCodeBlocks(content: string): FlutterCodeFile[] {
  const files: FlutterCodeFile[] = [];
  const regex = /```([^\n]+\.dart)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1]?.trim();
    const code = match[2]?.trim();
    if (path && code) {
      const normalized = path
        .replace(/^\.\//, ``)
        .replace(/^\//,  ``)
        .replace(/\\/g,  `/`);

      if (normalized.includes(`..`)) {
        continue;
      }

      files.push({ path: normalized, content: code });
    }
  }

  return files;
}
