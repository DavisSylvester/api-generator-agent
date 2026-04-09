import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
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
import { streamInvoke } from '../llm/stream-invoke.mts';

export interface CodegenInput {
  readonly taskName: string;
  readonly taskDescription: string;
  readonly taskType?: string;
  readonly taskId?: string;
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

  constructor(modelChain: ModelChainConfig, llmFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super('codegen', modelChain, llmFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<CodegenInput>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<CodegenOutput, Error>> {
    const { taskName, taskDescription, taskType, taskId, mode, existingCode, previousCode, errors } = input.payload;

    this.logger.info(`[codegen] Task: "${taskName}" | Type: ${taskType ?? `unknown`} | Mode: ${mode} | Iteration: ${input.iteration}`);
    if (mode === 'fix' && errors) {
      this.logger.info(`[codegen] Fixing ${errors.length} errors from previous iteration`);
    }

    let userPrompt: string;
    if (mode === 'fix' && previousCode && errors) {
      userPrompt = createFixPrompt(taskName, taskDescription, previousCode, errors, taskType, existingCode, taskId);
    } else {
      userPrompt = createCodegenUserPrompt(taskName, taskDescription, existingCode, taskType, taskId);
    }

    const messages = [
      new SystemMessage(CODEGEN_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ];

    this.logger.info(`[codegen] Sending prompt to LLM (${userPrompt.length} chars) (streaming)`);
    const content = await streamInvoke(chatModel, messages, traceConfig);

    this.logger.debug(`[codegen] LLM response received (${content.length} chars)`);

    const rawFiles = parseCodeBlocks(content);

    // Deduplicate files — keep first occurrence when LLM emits the same path twice
    const seen = new Set<string>();
    const files = rawFiles.filter((f) => {
      if (seen.has(f.path)) {
        this.logger.warn(`[codegen] Duplicate file path "${f.path}", keeping first occurrence`);
        return false;
      }
      seen.add(f.path);
      return true;
    });

    const sanitized = sanitizeCodeFiles(files, this.logger);

    if (sanitized.length === 0) {
      this.logger.warn('[codegen] No code blocks found in LLM response');
      this.logger.warn(`[codegen] Raw response (first 500 chars): ${content.substring(0, 500)}`);
      return err(new Error('No code blocks found in codegen response'));
    }

    this.logger.info(`[codegen] Generated ${sanitized.length} files:`);
    for (const file of sanitized) {
      this.logger.info(`[codegen]   - ${file.path} (${file.content.length} chars)`);
    }

    return ok(sanitized);
  }
}

function normalizePath(path: string): string {
  let normalized = path.trim();

  // Strip leading ./ or /
  normalized = normalized.replace(/^\.\//, ``).replace(/^\//, ``);

  // Normalize backslashes to forward slashes
  normalized = normalized.replace(/\\/g, `/`);

  // Convert .ts to .mts
  if (normalized.endsWith(`.ts`) && !normalized.endsWith(`.mts`)) {
    normalized = normalized.replace(/\.ts$/, `.mts`);
  }

  // Collapse ANY number of repeated src/ prefixes: src/src/src/... → src/...
  while (normalized.startsWith(`src/src/`)) {
    normalized = normalized.replace(`src/src/`, `src/`);
  }

  return normalized;
}

function parseCodeBlocks(content: string): CodeFile[] {
  const files: CodeFile[] = [];

  // Try: ```path/to/file.mts, .ts, .json, .toml, etc.
  const pathRegex = /```([^\n]+\.(?:mts|ts|json|toml|mjs))\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(content)) !== null) {
    const path = match[1]?.trim();
    const code = match[2]?.trim();
    if (path && code) {
      files.push({ path: normalizePath(path), content: code });
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

function sanitizeCodeFiles(files: readonly CodeFile[], logger: Logger): CodeFile[] {
  const forbiddenPattern = /^import\s+(?:['"]reflect-metadata['"]|.*from\s+['"](?:tsyringe|inversify|typedi|awilix)['"]).*$/gm;
  const importTypePattern = /^import\s+type\s+/gm;

  // Pass 1: sanitize individual files
  const pass1 = files.map((file) => {
    let content = file.content;

    const blockedContent = content.replace(forbiddenPattern, (match) => `// [blocked] ${match}`);
    if (blockedContent !== content) {
      logger.warn(`[codegen] Commented out forbidden DI framework imports in ${file.path}`);
      content = blockedContent;
    }

    if (importTypePattern.test(content)) {
      content = content.replace(/^import\s+type\s+/gm, `import `);
      logger.warn(`[codegen] Converted import type → import in ${file.path}`);
    }

    // Remove `export type X = Static<typeof Y>` lines — erased at runtime
    if (/^export\s+type\s+\w+\s*=\s*Static<.*>.*$/gm.test(content)) {
      content = content.replace(/^export\s+type\s+\w+\s*=\s*Static<.*>.*$/gm, ``);
      logger.warn(`[codegen] Removed export type aliases (Static<>) in ${file.path}`);
    }

    return content !== file.content ? { path: file.path, content } : file;
  });

  // Pass 2: clean barrel re-exports — remove names that source files don't export
  const exportMap = new Map<string, Set<string>>();
  for (const file of pass1) {
    const names = new Set<string>();
    for (const match of file.content.matchAll(/^export\s+(?:const|function|class)\s+(\w+)/gm)) {
      if (match[1]) names.add(match[1]);
    }
    exportMap.set(file.path, names);
  }

  return pass1.map((file) => {
    // Only process barrel files (files with re-export lines)
    if (!file.content.includes(`} from './`) && !file.content.includes(`} from "../`)) {
      return file;
    }

    let content = file.content;

    // Strip `export type { ... } from` lines entirely — type re-exports break at runtime
    if (/^export\s+type\s+\{/gm.test(content)) {
      content = content.replace(/^export\s+type\s+\{[^}]*\}\s+from\s+['"`][^'"`]+['"`].*$/gm, ``);
      logger.warn(`[codegen] Stripped export type re-exports from barrel ${file.path}`);
    }

    const reExportPattern = /^export\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`].*$/gm;
    let modified = false;

    content = content.replace(reExportPattern, (line, namesList: string, fromPath: string) => {
      // Resolve the source file path
      const dir = file.path.substring(0, file.path.lastIndexOf(`/`));
      let resolved = fromPath.startsWith(`./`) ? `${dir}/${fromPath.substring(2)}` : `${dir}/${fromPath}`;
      if (!resolved.endsWith(`.mts`)) resolved += `.mts`;

      const sourceExports = exportMap.get(resolved);
      if (!sourceExports) return line; // can't verify, keep as-is

      const names = namesList.split(`,`).map((n) => n.trim()).filter(Boolean);
      const validNames = names.filter((n) => {
        const baseName = n.includes(` as `) ? n.split(` as `)[0]!.trim() : n;
        return sourceExports.has(baseName);
      });

      if (validNames.length === 0) {
        modified = true;
        logger.warn(`[codegen] Removed empty barrel re-export from ${fromPath} in ${file.path}`);
        return ``;
      }

      if (validNames.length < names.length) {
        modified = true;
        const removed = names.filter((n) => !validNames.includes(n));
        logger.warn(`[codegen] Removed non-existent exports [${removed.join(`, `)}] from barrel in ${file.path}`);
        return `export { ${validNames.join(`, `)} } from '${fromPath}'`;
      }

      return line;
    });

    return modified ? { path: file.path, content } : file;
  });
}
