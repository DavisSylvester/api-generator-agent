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
  CODEGEN_SYSTEM_PROMPT,
  createCodegenUserPrompt,
  createFixPrompt,
} from '../prompts/codegen.mts';

export interface CodegenInput {
  readonly taskName: string;
  readonly taskDescription: string;
  readonly mode: 'generate' | 'fix';
  readonly existingCode?: string;
  readonly previousCode?: string;
  readonly errors?: readonly string[];
}

export interface CodeFile {
  readonly path: string;
  readonly content: string;
}

export type CodegenOutput = readonly CodeFile[];

export class CodegenAgent extends BaseAgent<CodegenInput, CodegenOutput> {

  constructor(modelChain: ModelChainConfig, ollamaFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super('codegen', modelChain, ollamaFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<CodegenInput>,
    chatModel: ChatOllama,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<CodegenOutput, Error>> {
    const { taskName, taskDescription, mode, existingCode, previousCode, errors } = input.payload;

    this.logger.info(`[codegen] Task: "${taskName}" | Mode: ${mode} | Iteration: ${input.iteration}`);
    if (mode === 'fix' && errors) {
      this.logger.info(`[codegen] Fixing ${errors.length} errors from previous iteration`);
    }

    let userPrompt: string;
    if (mode === 'fix' && previousCode && errors) {
      userPrompt = createFixPrompt(taskName, taskDescription, previousCode, errors);
    } else {
      userPrompt = createCodegenUserPrompt(taskName, taskDescription, existingCode);
    }

    const messages = [
      new SystemMessage(CODEGEN_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ];

    this.logger.info(`[codegen] Sending prompt to LLM (${userPrompt.length} chars)`);
    const response = await chatModel.invoke(messages, traceConfig);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    this.logger.debug(`[codegen] LLM response received (${content.length} chars)`);

    const files = parseCodeBlocks(content);

    if (files.length === 0) {
      this.logger.warn('[codegen] No code blocks found in LLM response');
      this.logger.warn(`[codegen] Raw response (first 500 chars): ${content.substring(0, 500)}`);
      return err(new Error('No code blocks found in codegen response'));
    }

    this.logger.info(`[codegen] Generated ${files.length} files:`);
    for (const file of files) {
      this.logger.info(`[codegen]   - ${file.path} (${file.content.length} chars)`);
    }

    return ok(files);
  }
}

function parseCodeBlocks(content: string): CodeFile[] {
  const files: CodeFile[] = [];

  // Try: ```path/to/file.mts or ```path/to/file.ts
  const pathRegex = /```([^\n]+\.(?:mts|ts))\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(content)) !== null) {
    const path = match[1]?.trim();
    const code = match[2]?.trim();
    if (path && code) {
      const normalizedPath = path.endsWith('.ts') && !path.endsWith('.mts')
        ? path.replace(/\.ts$/, '.mts')
        : path;
      files.push({ path: normalizedPath, content: code });
    }
  }

  // Fallback: ```typescript or ```ts or bare ``` blocks
  if (files.length === 0) {
    const fallbackRegex = /```(?:typescript|ts|mts)?\n([\s\S]*?)```/g;
    let fallbackMatch: RegExpExecArray | null;
    let index = 0;
    while ((fallbackMatch = fallbackRegex.exec(content)) !== null) {
      const code = fallbackMatch[1]?.trim();
      if (code && code.length > 10) {
        files.push({ path: `generated-${index}.mts`, content: code });
        index++;
      }
    }
  }

  return files;
}
