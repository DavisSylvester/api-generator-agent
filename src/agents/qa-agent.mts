import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { join, relative } from 'node:path';
import { writeFile, mkdir, access, readFile } from 'node:fs/promises';
import type { Logger } from 'winston';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import { QA_SYSTEM_PROMPT, createQaUserPrompt } from '../prompts/qa.mts';
import {
  QA_INTEGRATION_SYSTEM_PROMPT,
  createQaIntegrationUserPrompt,
} from '../prompts/qa-integration.mts';
import { streamInvoke } from '../llm/stream-invoke.mts';
import { readKnowledge, appendKnowledge, analyzeTestErrors } from './qa-knowledge.mts';
import type { CodeFile } from './codegen-agent.mts';

export interface QaInput {
  readonly taskId: string;
  readonly taskName: string;
  readonly taskDescription: string;
  readonly taskType?: string;
  readonly codeFiles: readonly CodeFile[];
  readonly testsDir: string;
  readonly codeDir: string;
  readonly integrationDir: string;
  readonly knowledgePath: string;
  readonly mode: 'generate' | 'runOnly';
  readonly port: number;
  readonly testScope?: 'unit-only' | 'full';
}

export interface TestPhaseResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
  readonly output: string;
}

export interface QaResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
  readonly testOutput: string;
  readonly testFile?: string;
  readonly unit: TestPhaseResult;
  readonly integration: TestPhaseResult;
}

export class QaAgent extends BaseAgent<QaInput, QaResult> {

  constructor(modelChain: ModelChainConfig, llmFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super(`qa`, modelChain, llmFactory, logger, timeoutMs, false);
  }

  protected async execute(
    input: AgentInput<QaInput>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<QaResult, Error>> {
    const {
      taskId, taskName, taskDescription, taskType, codeFiles,
      testsDir, codeDir, integrationDir, knowledgePath, mode, port,
    } = input.payload;

    const knowledge = await readKnowledge(knowledgePath);
    const testFilePath = join(testsDir, `${taskId}.test.mts`);
    const collectionPath = join(integrationDir, 'collection.json');
    const taskDir = join(testsDir, '..');

    const codeStr = codeFiles
      .map((f) => `// ${f.path}\n${f.content}`)
      .join('\n\n');

    // Write code files to code dir (needed for both modes — code may have changed)
    this.logger.info(`[qa] Writing ${codeFiles.length} code files to ${codeDir}`);
    for (const file of codeFiles) {
      const codePath = join(codeDir, file.path);
      const dir = join(codePath, '..');
      await mkdir(dir, { recursive: true });
      await writeFile(codePath, file.content, 'utf-8');
    }

    // Install third-party dependencies so imports resolve at test time
    await this.installDependencies(codeFiles, taskDir);

    if (mode === 'generate') {
      this.logger.info(`[qa] Generating unit tests for task: "${taskName}" (${codeFiles.length} code files)`);

      // Generate unit tests
      const unitMessages = [
        new SystemMessage(QA_SYSTEM_PROMPT),
        new HumanMessage(createQaUserPrompt(taskName, taskDescription, codeStr, knowledge, taskType)),
      ];

      this.logger.info('[qa] Sending code to LLM for unit test generation (streaming)');
      const unitContent = await streamInvoke(chatModel, unitMessages, traceConfig);

      // Debug logging to diagnose parse failures
      this.logger.info(`[qa][debug] Response length: ${unitContent.length} chars`);
      this.logger.info(`[qa][debug] First 500 chars: ${unitContent.substring(0, 500)}`);
      this.logger.info(`[qa][debug] Contains triple backticks: ${unitContent.includes('```')}`);
      this.logger.info(`[qa][debug] Contains <think>: ${unitContent.includes('<think')}`);

      const testFile = parseTestFile(unitContent);
      if (!testFile) {
        this.logger.warn('[qa] No unit test file found in LLM response');
        this.logger.warn(`[qa][debug] Parse returned undefined. Full response (last 500 chars): ${unitContent.substring(unitContent.length - 500)}`);
        return err(new Error('No unit test file found in QA response'));
      }

      this.logger.info(`[qa][debug] Parse succeeded, extracted ${testFile.length} chars`);

      this.logger.info(`[qa] Unit test file generated (${testFile.length} chars)`);
      await mkdir(testsDir, { recursive: true });
      await writeFile(testFilePath, testFile, 'utf-8');

      // Generate Hoppscotch integration collection
      this.logger.info(`[qa] Generating Hoppscotch collection for task: "${taskName}"`);
      const integrationMessages = [
        new SystemMessage(QA_INTEGRATION_SYSTEM_PROMPT),
        new HumanMessage(createQaIntegrationUserPrompt(taskName, taskDescription, codeStr, knowledge)),
      ];

      const integrationContent = await streamInvoke(chatModel, integrationMessages, traceConfig);
      const collection = parseJsonBlock(integrationContent);
      if (!collection) {
        this.logger.warn('[qa] No Hoppscotch collection JSON found in LLM response');
        return err(new Error('No Hoppscotch collection found in QA response'));
      }

      this.logger.info(`[qa] Hoppscotch collection generated (${collection.length} chars)`);
      await mkdir(integrationDir, { recursive: true });
      await writeFile(collectionPath, collection, 'utf-8');
    } else {
      // runOnly mode — verify existing files exist
      const [testExists, collectionExists] = await Promise.all([
        fileExists(testFilePath),
        fileExists(collectionPath),
      ]);
      if (!testExists) {
        return err(new Error(`runOnly mode but no test file at ${testFilePath}`));
      }
      if (!collectionExists) {
        return err(new Error(`runOnly mode but no Hoppscotch collection at ${collectionPath}`));
      }
      this.logger.info(`[qa] Re-running existing tests for task: "${taskName}"`);
    }

    // ── Phase 1: Unit tests (bun test with .handle()) ──
    const relativeTestPath = relative(taskDir, testFilePath);
    this.logger.info(`[qa] Running unit tests: ${relativeTestPath} (cwd: ${taskDir})`);
    const unitStartMs = performance.now();
    const unitResult = await this.runBunTests(relativeTestPath, taskDir);
    const unitDurationMs = Math.round(performance.now() - unitStartMs);

    if (unitResult.passed) {
      this.logger.info(`[qa] Unit tests PASSED in ${unitDurationMs}ms`);
    } else {
      this.logger.warn(`[qa] Unit tests FAILED in ${unitDurationMs}ms — ${unitResult.errors.length} errors`);
      for (const error of unitResult.errors.slice(0, 5)) {
        this.logger.warn(`[qa]   - ${error}`);
      }
    }

    // ── Phase 2: Integration tests (Hoppscotch against running server) ──
    let integrationResult: TestPhaseResult;
    if (input.payload.testScope === `unit-only`) {
      this.logger.info(`[qa] Skipping integration tests (unit-only mode)`);
      integrationResult = { passed: true, errors: [], output: `Skipped (unit-only mode)` };
    } else {
      this.logger.info(`[qa] Starting integration tests on port ${port}`);
      integrationResult = await this.runIntegrationTests(codeFiles, codeDir, collectionPath, port);
    }

    if (integrationResult.passed) {
      this.logger.info('[qa] Integration tests PASSED');
    } else {
      this.logger.warn(`[qa] Integration tests FAILED — ${integrationResult.errors.length} errors`);
      for (const error of integrationResult.errors.slice(0, 5)) {
        this.logger.warn(`[qa]   - ${error}`);
      }
    }

    // ── Combine results ──
    const allPassed = unitResult.passed && integrationResult.passed;
    const allErrors = [...unitResult.errors, ...integrationResult.errors];
    const combinedOutput = [
      '=== UNIT TESTS ===',
      unitResult.output,
      '',
      '=== INTEGRATION TESTS ===',
      integrationResult.output,
    ].join('\n');

    if (!allPassed) {
      const newKnowledge = analyzeTestErrors(combinedOutput);
      if (newKnowledge.length > 0) {
        this.logger.info(`[qa] Extracted ${newKnowledge.length} knowledge entries from test failures`);
        await appendKnowledge(knowledgePath, newKnowledge, this.logger);
      }
    }

    let testFileContent: string | undefined;
    if (mode === 'generate') {
      try {
        testFileContent = await readFile(testFilePath, 'utf-8');
      } catch {
        // Not critical
      }
    }

    return ok({
      passed: allPassed,
      errors: allErrors,
      testOutput: combinedOutput,
      testFile: testFileContent,
      unit: unitResult,
      integration: integrationResult,
    });
  }

  private async installDependencies(codeFiles: readonly CodeFile[], taskDir: string): Promise<void> {
    const thirdParty = new Set<string>();

    for (const file of codeFiles) {
      const importMatches = file.content.matchAll(/(?:import|from)\s+['"]([^./][^'"]*)['"]/g);
      for (const match of importMatches) {
        const specifier = match[1]!;
        const pkgName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]!;

        if (pkgName.startsWith('bun:') || pkgName.startsWith('node:')) continue;
        thirdParty.add(pkgName);
      }
    }

    // Block forbidden DI frameworks and polyfills that crash at runtime
    const BLOCKED_PACKAGES = new Set([
      `tsyringe`,
      `inversify`,
      `reflect-metadata`,
      `typedi`,
      `awilix`,
      `injection-js`,
      `typed-inject`,
      `better-sqlite3`,
      `sqlite3`,
      `bcrypt`,
      `argon2`,
      `node-gyp`,
    ]);

    for (const pkg of [...thirdParty]) {
      if (BLOCKED_PACKAGES.has(pkg)) {
        this.logger.warn(`[qa] Blocked forbidden dependency: ${pkg}`);
        thirdParty.delete(pkg);
      }
    }

    if (thirdParty.size === 0) {
      this.logger.debug(`[qa] No third-party dependencies to install`);
      return;
    }

    const pkgJsonPath = join(taskDir, `package.json`);
    let existingDeps = new Set<string>();

    try {
      await access(pkgJsonPath);
      const raw = await readFile(pkgJsonPath, `utf-8`);
      const parsed = JSON.parse(raw) as { dependencies?: Record<string, string> };
      if (parsed.dependencies) {
        existingDeps = new Set(Object.keys(parsed.dependencies));
      }
    } catch {
      // No existing package.json — create one
      const pkgJson = JSON.stringify({ name: `qa-workspace`, private: true, dependencies: {} }, null, 2);
      await writeFile(pkgJsonPath, pkgJson, `utf-8`);
    }

    // Only install deps not already listed
    for (const pkg of [...thirdParty]) {
      if (existingDeps.has(pkg)) {
        thirdParty.delete(pkg);
      }
    }

    if (thirdParty.size === 0) {
      this.logger.debug(`[qa] All dependencies already listed in package.json`);
      return;
    }

    const deps = [...thirdParty];
    this.logger.info(`[qa] Installing ${deps.length} dependencies: ${deps.join(`, `)}`);

    // Try all at once first — fastest path
    try {
      const proc = Bun.spawn([`bun`, `add`, ...deps], {
        cwd: taskDir,
        stdout: `pipe`,
        stderr: `pipe`,
        env: { ...Bun.env },
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        this.logger.info(`[qa] Dependencies installed successfully`);
        return;
      }

      this.logger.warn(`[qa] Batch bun add failed (code ${exitCode}), falling back to individual installs`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[qa] Batch install error: ${msg}, falling back to individual installs`);
    }

    // Fall back: install one at a time so one bad package doesn't block the rest
    for (const dep of deps) {
      try {
        const proc = Bun.spawn([`bun`, `add`, dep], {
          cwd: taskDir,
          stdout: `pipe`,
          stderr: `pipe`,
          env: { ...Bun.env },
        });

        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        if (exitCode === 0) {
          this.logger.info(`[qa] Installed: ${dep}`);
        } else {
          this.logger.warn(`[qa] Failed to install ${dep}: ${stderr.trim().substring(0, 200)}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[qa] Failed to install ${dep}: ${msg}`);
      }
    }
  }

  private async runBunTests(testFilePath: string, cwd: string): Promise<TestPhaseResult> {
    try {
      this.logger.info(`[qa] Running: bun test ${testFilePath} (cwd: ${cwd})`);
      const proc = Bun.spawn(['bun', 'test', '--timeout', '30000', testFilePath], {
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

      // Detect 0 test files matched — bun test exits 1 with a specific message
      if (output.includes('0 test files')) {
        this.logger.warn(`[qa] bun test found 0 matching test files for filter: ${testFilePath}`);
        return {
          passed: false,
          errors: [`bun test found 0 matching test files for: ${testFilePath}. Ensure the file exists and has a .test.{ts,mts,js} extension.`],
          output,
        };
      }

      const errors = extractErrors(output);

      this.logger.info(`[qa] bun test exit code: ${exitCode}, output length: ${output.length} chars`);
      return { passed: exitCode === 0, errors, output };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { passed: false, errors: [errorMsg], output: errorMsg };
    }
  }

  public async runIntegrationTests(
    codeFiles: readonly CodeFile[],
    codeDir: string,
    collectionPath: string,
    port: number,
  ): Promise<TestPhaseResult> {
    // Find the entry file that calls .listen() — look for the main server file
    const entryFile = findEntryFile(codeFiles);
    if (!entryFile) {
      return {
        passed: false,
        errors: ['Could not find server entry file (no file exports an Elysia app or calls .listen())'],
        output: 'No entry file found for integration tests',
      };
    }

    const entryPath = join(codeDir, entryFile.path);
    let serverProc: ReturnType<typeof Bun.spawn> | undefined;

    try {
      // Start the server
      this.logger.info(`[qa] Starting server: ${entryPath} on port ${port}`);
      serverProc = Bun.spawn(['bun', 'run', entryPath], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...Bun.env, PORT: String(port) },
      });

      // Wait for the server to be ready
      const ready = await this.waitForServer(port, 15000);
      if (!ready) {
        // Kill the process and capture its output
        try { serverProc.kill(); } catch { /* may have already exited */ }
        const exitCode = await Promise.race([
          serverProc.exited,
          new Promise<number>((resolve) => setTimeout(() => resolve(-1), 3000)),
        ]);

        const [stdout, stderr] = await Promise.all([
          collectStream(serverProc.stdout, 3000),
          collectStream(serverProc.stderr, 3000),
        ]);
        const combinedOutput = `stdout:\n${stdout}\nstderr:\n${stderr}\nexit code: ${exitCode}`;
        this.logger.warn(`[qa] Server failed to start. ${combinedOutput}`);

        // Don't return — set serverProc to undefined so finally doesn't double-kill
        serverProc = undefined;
        return {
          passed: false,
          errors: [`Server failed to start on port ${port} within 15s`, stderr || stdout].filter(Boolean),
          output: `Server startup failed:\n${combinedOutput}`,
        };
      }

      // Pre-flight check: verify server returns valid JSON, not leaked Promises
      const preflight = await this.preflightCheck(port);
      if (!preflight.ok) {
        for (const warning of preflight.errors) {
          this.logger.warn(`[qa] Preflight: ${warning}`);
        }
      }

      this.logger.info(`[qa] Server is ready on port ${port}, running Hoppscotch tests`);

      // Write environment file for Hoppscotch CLI
      const envPath = join(collectionPath, `..`, `env.json`);
      const envJson = JSON.stringify({
        name: `integration-${port}`,
        variables: [
          { key: `BASE_URL`, value: `http://localhost:${port}` },
        ],
      }, null, 2);
      await writeFile(envPath, envJson, `utf-8`);

      // Run hopp test
      const hoppProc = Bun.spawn(
        ['bunx', '@hoppscotch/cli', 'test', '--env', envPath, collectionPath],
        {
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...Bun.env },
        },
      );

      const [hoppStdout, hoppStderr] = await Promise.all([
        new Response(hoppProc.stdout).text(),
        new Response(hoppProc.stderr).text(),
      ]);

      const hoppExit = await hoppProc.exited;
      const output = `${hoppStdout}\n${hoppStderr}`.trim();
      const errors = extractErrors(output);

      // Include preflight warnings as errors when integration tests also fail
      const allErrors = (hoppExit !== 0 && !preflight.ok)
        ? [...preflight.errors, ...errors]
        : [...errors];

      return { passed: hoppExit === 0, errors: allErrors, output };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { passed: false, errors: [errorMsg], output: errorMsg };
    } finally {
      // Kill the server process
      if (serverProc) {
        try {
          serverProc.kill();
          await serverProc.exited;
        } catch {
          // Process may have already exited
        }
        this.logger.info('[qa] Server process stopped');
      }
    }
  }

  private async preflightCheck(port: number): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];
    try {
      // Try /health first, fall back to /
      let response: Response;
      try {
        response = await fetch(`http://localhost:${port}/health`);
      } catch {
        response = await fetch(`http://localhost:${port}/`);
      }

      const contentType = response.headers.get(`content-type`) ?? ``;

      if (!contentType.includes(`application/json`)) {
        errors.push(`Preflight: Root endpoint returned Content-Type "${contentType}" instead of application/json`);
      }

      const body = await response.text();

      // Detect leaked Promise objects — a common async/await mistake
      if (body.includes(`[object Promise]`)) {
        errors.push(`Preflight: Response body contains "[object Promise]" — route handler is missing async/await`);
      }

      // Verify the body is valid JSON
      try {
        JSON.parse(body);
      } catch {
        errors.push(`Preflight: Response body is not valid JSON: ${body.substring(0, 200)}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Preflight: Failed to reach server at port ${port}: ${msg}`);
    }

    return { ok: errors.length === 0, errors };
  }

  private async waitForServer(port: number, timeoutMs: number): Promise<boolean> {
    const startMs = performance.now();
    const interval = 500;

    while (performance.now() - startMs < timeoutMs) {
      try {
        // Try /health first, fall back to /
        let response: Response;
        try {
          response = await fetch(`http://localhost:${port}/health`);
        } catch {
          response = await fetch(`http://localhost:${port}/`);
        }
        // Any response means the server is up
        await response.text();
        return true;
      } catch {
        // Server not ready yet
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    return false;
  }
}

function findEntryFile(codeFiles: readonly CodeFile[]): CodeFile | undefined {
  // Prefer a file that calls .listen() — that's the server entry point
  const listenFile = codeFiles.find((f) => f.content.includes('.listen('));
  if (listenFile) return listenFile;

  // Fall back to common entry file patterns
  const entryPatterns = [
    'src/index.mts',
    'index.mts',
    'src/server.mts',
    'src/app.mts',
    'server.mts',
    'app.mts',
  ];

  for (const pattern of entryPatterns) {
    const match = codeFiles.find((f) => f.path === pattern || f.path.endsWith(`/${pattern}`));
    if (match) return match;
  }

  // Last resort — find any file that creates an Elysia instance
  const elysiaFile = codeFiles.find((f) => f.content.includes('new Elysia('));
  return elysiaFile;
}

async function collectStream(stream: ReadableStream<Uint8Array> | number | null | undefined, maxChars: number): Promise<string> {
  if (typeof stream === 'number' || !stream) return '';
  try {
    const text = await new Response(stream).text();
    return text.substring(0, maxChars);
  } catch {
    return '';
  }
}

function looksLikeTestCode(code: string): boolean {
  return code.includes('bun:test') || code.includes('describe(') || code.includes('it(');
}

function parseTestFile(content: string): string | undefined {
  // Strategy 1: Fenced code blocks with various language tags / path-style labels
  // Matches: ```typescript, ```ts, ```mts, ```tests/foo.test.mts, ```<anything>, and bare ```
  const fencedBlockPattern = /```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencedBlockPattern.exec(content)) !== null) {
    const code = match[1]?.trim();
    if (code && looksLikeTestCode(code)) {
      return code;
    }
  }

  // Strategy 2: No code fences at all — try to extract raw code starting with import
  // This handles cases where the model outputs test code directly without fences
  const importStart = content.indexOf('import ');
  if (importStart !== -1) {
    const rawCode = content.substring(importStart).trim();
    if (looksLikeTestCode(rawCode)) {
      return rawCode;
    }
  }

  return undefined;
}

function parseJsonBlock(content: string): string | undefined {
  // Try fenced code block first
  const fenced = /```(?:json)?\n([\s\S]*?)```/.exec(content);
  if (fenced?.[1]) return fenced[1].trim();

  // Fall back to raw JSON extraction
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch?.[0]?.trim();
}

function extractErrors(output: string): readonly string[] {
  const errors: string[] = [];
  const lines = output.split(`\n`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.includes(`(fail)`) ||
      trimmed.includes(`error:`) ||
      trimmed.includes(`FAIL`) ||
      trimmed.includes(`✗`) ||
      trimmed.includes(`SyntaxError:`) ||
      trimmed.includes(`TypeError:`) ||
      trimmed.includes(`ReferenceError:`) ||
      trimmed.includes(`ModuleNotFound`) ||
      trimmed.includes(`Cannot find`) ||
      trimmed.includes(`ENOENT`) ||
      trimmed.includes(`panic`) ||
      trimmed.startsWith(`^`)
    ) {
      errors.push(trimmed);
    }
  }

  if (errors.length === 0 && output.trim().length > 0) {
    const truncated = output.trim().substring(0, 2000);
    errors.push(`Test output (no specific errors extracted):\n${truncated}`);
  }

  return errors;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
