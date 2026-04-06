import type { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import type { Logger } from 'winston';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import { QA_SYSTEM_PROMPT, createQaUserPrompt } from '../prompts/qa.mts';
import type { CodeFile } from './codegen-agent.mts';

export interface QaInput {
  readonly taskId: string;
  readonly taskName: string;
  readonly taskDescription: string;
  readonly codeFiles: readonly CodeFile[];
  readonly testsDir: string;
  readonly codeDir: string;
}

export interface QaResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
  readonly testOutput: string;
  readonly testFile?: string;
}

export class QaAgent extends BaseAgent<QaInput, QaResult> {

  constructor(modelChain: ModelChainConfig, ollamaFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super('qa', modelChain, ollamaFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<QaInput>,
    chatModel: ChatOllama,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<QaResult, Error>> {
    const { taskId, taskName, taskDescription, codeFiles, testsDir, codeDir } = input.payload;

    this.logger.info(`[qa] Generating tests for task: "${taskName}" (${codeFiles.length} code files)`);

    const codeStr = codeFiles
      .map((f) => `// ${f.path}\n${f.content}`)
      .join('\n\n');

    const messages = [
      new SystemMessage(QA_SYSTEM_PROMPT),
      new HumanMessage(createQaUserPrompt(taskName, taskDescription, codeStr)),
    ];

    this.logger.info('[qa] Sending code to LLM for test generation');
    const response = await chatModel.invoke(messages, traceConfig);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    this.logger.debug(`[qa] LLM response received (${content.length} chars)`);

    const testFile = parseTestFile(content);
    if (!testFile) {
      this.logger.warn('[qa] No test file found in LLM response');
      return err(new Error('No test file found in QA response'));
    }

    this.logger.info(`[qa] Test file generated (${testFile.length} chars)`);

    await mkdir(testsDir, { recursive: true });
    const testFilePath = join(testsDir, `${taskId}.test.mts`);
    await writeFile(testFilePath, testFile, 'utf-8');

    this.logger.info(`[qa] Writing ${codeFiles.length} code files to ${codeDir}`);
    for (const file of codeFiles) {
      const codePath = join(codeDir, file.path);
      const dir = join(codePath, '..');
      await mkdir(dir, { recursive: true });
      await writeFile(codePath, file.content, 'utf-8');
    }

    this.logger.info(`[qa] Running tests: ${testFilePath}`);
    const testStartMs = performance.now();
    const testResult = await this.runTests(testFilePath, codeDir);
    const testDurationMs = Math.round(performance.now() - testStartMs);

    if (testResult.passed) {
      this.logger.info(`[qa] Tests PASSED in ${testDurationMs}ms`);
    } else {
      this.logger.warn(`[qa] Tests FAILED in ${testDurationMs}ms — ${testResult.errors.length} errors`);
      for (const error of testResult.errors.slice(0, 5)) {
        this.logger.warn(`[qa]   - ${error}`);
      }
    }

    return ok({
      ...testResult,
      testFile,
    });
  }

  private async runTests(testFilePath: string, cwd: string): Promise<QaResult> {
    try {
      const proc = Bun.spawn(['bun', 'test', testFilePath], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...Bun.env },
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;
      const output = `${stdout}\n${stderr}`.trim();
      const errors = extractErrors(output);

      return {
        passed: exitCode === 0,
        errors,
        testOutput: output,
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        passed: false,
        errors: [errorMsg],
        testOutput: errorMsg,
      };
    }
  }
}

function parseTestFile(content: string): string | undefined {
  const regex = /```(?:[^\n]*\.test\.mts|typescript|ts)\n([\s\S]*?)```/;
  const match = regex.exec(content);
  return match?.[1]?.trim();
}

function extractErrors(output: string): readonly string[] {
  const errors: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (
      line.includes('error') ||
      line.includes('Error') ||
      line.includes('FAIL') ||
      line.includes('✗') ||
      line.includes('expected')
    ) {
      errors.push(line.trim());
    }
  }

  return errors;
}
