import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import type { PipelineStateType } from '../graph/state.mts';
import { MODEL_CHAINS } from '../config/models.mts';
import { invokeWithFallback } from '../llm/create-chat-model.mts';

const SYSTEM_PROMPT = `You are a QA engineer writing tests for an Elysia API with BunJS.
Use bun:test (import { describe, it, expect } from 'bun:test').
Test happy paths, validation errors (400), not-found (404), and edge cases.

Output a single test file as a fenced code block:
\`\`\`tests/task.test.mts
// test code
\`\`\``;

export async function qaNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const host = Bun.env['OLLAMA_HOST'] ?? 'http://192.168.128.230:11434';
  const codeToTest = state.lintedCodeFiles.length > 0 ? state.lintedCodeFiles : state.codeFiles;

  console.log(`[qa-node] Generating tests for task: "${state.currentTaskName}" (${codeToTest.length} code files, iteration ${state.iteration})`);
  console.log(`[qa-node] Sending code to LLM for test generation`);

  const codeStr = codeToTest
    .map((f) => `// ${f.path}\n${f.content}`)
    .join('\n\n');

  const llmResult = await invokeWithFallback(
    host,
    MODEL_CHAINS.qa,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `## Task: ${state.currentTaskName}\n\n${state.currentTaskDescription}\n\n## Code\n${codeStr}\n\nGenerate a test suite.` },
    ],
    {
      agentRole: 'qa',
      runId: state.runId,
      taskId: state.currentTaskId,
      iteration: state.iteration,
      tags: ['qa', `task:${state.currentTaskId}`, `iter:${state.iteration}`],
    },
  );

  if (!llmResult.ok) {
    console.error(`[qa-node] QA LLM failed: ${llmResult.error.message}`);
    return {
      qaPassed: false,
      qaErrors: [`QA agent failed: ${llmResult.error.message}`],
    };
  }

  const testFileContent = parseTestFile(llmResult.value.content);
  if (!testFileContent) {
    console.warn('[qa-node] No test file found in LLM response');
    return {
      qaPassed: false,
      qaErrors: ['No test file found in QA response'],
    };
  }

  console.log(`[qa-node] Test file generated (${testFileContent.length} chars)`);

  const testsDir = join(state.workspaceDir, state.runId, 'tasks', state.currentTaskId, 'tests');
  const codeDir = join(state.workspaceDir, state.runId, 'tasks', state.currentTaskId, 'code');
  await mkdir(testsDir, { recursive: true });
  await mkdir(codeDir, { recursive: true });

  const testFilePath = join(testsDir, `${state.currentTaskId}.test.mts`);
  await writeFile(testFilePath, testFileContent, 'utf-8');

  for (const file of codeToTest) {
    const codePath = join(codeDir, file.path);
    const dir = join(codePath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(codePath, file.content, 'utf-8');
  }

  console.log(`[qa-node] Running tests: ${testFilePath}`);
  const testStartMs = performance.now();

  try {
    const proc = Bun.spawn(['bun', 'test', testFilePath], {
      cwd: codeDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...Bun.env },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    const testDurationMs = Math.round(performance.now() - testStartMs);
    const output = `${stdout}\n${stderr}`.trim();
    const errors = extractErrors(output);

    if (exitCode === 0) {
      console.log(`[qa-node] Tests PASSED in ${testDurationMs}ms`);
    } else {
      console.warn(`[qa-node] Tests FAILED in ${testDurationMs}ms — ${errors.length} errors`);
      for (const error of errors.slice(0, 5)) {
        console.warn(`[qa-node]   - ${error}`);
      }
    }

    return {
      qaPassed: exitCode === 0,
      qaErrors: errors,
      iteration: state.iteration + 1,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[qa-node] Test execution crashed: ${errorMsg}`);
    return {
      qaPassed: false,
      qaErrors: [errorMsg],
      iteration: state.iteration + 1,
    };
  }
}

function parseTestFile(content: string): string | undefined {
  const regex = /```(?:[^\n]*\.test\.mts|typescript|ts)\n([\s\S]*?)```/;
  const match = regex.exec(content);
  return match?.[1]?.trim();
}

function extractErrors(output: string): readonly string[] {
  const errors: string[] = [];
  for (const line of output.split('\n')) {
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
