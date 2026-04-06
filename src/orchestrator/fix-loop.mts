import type { Logger } from 'winston';
import type { Task, TaskState } from '../types/task.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { CodegenAgent, CodegenInput, CodeFile } from '../agents/codegen-agent.mts';
import type { EslintAgent } from '../agents/eslint-agent.mts';
import type { QaAgent, QaInput } from '../agents/qa-agent.mts';
import type { Workspace } from '../io/workspace.mts';
import { writeJson, writeCode, readAllCodeFiles } from '../io/file-protocol.mts';

export interface FixLoopConfig {
  readonly maxIterations: number;
}

export interface FixLoopDeps {
  readonly codegenAgent: CodegenAgent;
  readonly eslintAgent: EslintAgent;
  readonly qaAgent: QaAgent;
  readonly workspace: Workspace;
  readonly logger: Logger;
}

export async function runFixLoop(
  task: Task,
  runId: string,
  deps: FixLoopDeps,
  config: FixLoopConfig,
): Promise<Result<TaskState, Error>> {
  const { codegenAgent, eslintAgent, qaAgent, workspace, logger } = deps;

  await workspace.initTask(task.id);

  let lastErrors: readonly string[] = [];
  let lastCode: readonly CodeFile[] = [];
  let existingCodeContext: string | undefined;

  const completedCodeResult = await gatherExistingCode(workspace, task);
  if (completedCodeResult.ok) {
    existingCodeContext = completedCodeResult.value;
  }

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    logger.info(`[fix-loop] Task ${task.id} — iteration ${iteration + 1}/${config.maxIterations}`);
    await workspace.initIteration(task.id, iteration);

    // Step 1: CodeGen
    const codegenInput: CodegenInput = iteration === 0
      ? {
          taskName: task.name,
          taskDescription: task.description,
          mode: 'generate',
          existingCode: existingCodeContext,
        }
      : {
          taskName: task.name,
          taskDescription: task.description,
          mode: 'fix',
          previousCode: lastCode.map((f) => `// ${f.path}\n${f.content}`).join('\n\n'),
          errors: lastErrors,
        };

    const agentInput: AgentInput<CodegenInput> = {
      runId,
      taskId: task.id,
      payload: codegenInput,
      iteration,
    };

    const codegenResult = await codegenAgent.run(agentInput);
    if (!codegenResult.ok) {
      logger.error(`[fix-loop] CodeGen failed for task ${task.id}: ${codegenResult.error.message}`);
      await writeJson(workspace.taskStatusPath(task.id), {
        status: 'failed',
        iteration,
        lastError: `CodeGen failed: ${codegenResult.error.message}`,
      });
      return ok({
        taskId: task.id,
        status: 'failed',
        iteration,
        lastError: `CodeGen failed: ${codegenResult.error.message}`,
      });
    }

    let codeFiles = codegenResult.value.payload;

    // Save iteration code
    logger.info(`[fix-loop] Writing ${codeFiles.length} files to iteration ${iteration} workspace`);
    for (const file of codeFiles) {
      const iterPath = `${workspace.iterationDir(task.id, iteration)}/code/${file.path}`;
      const writeResult = await writeCode(iterPath, file.content);
      if (!writeResult.ok) {
        logger.error(`[fix-loop] Failed to write ${iterPath}: ${writeResult.error.message}`);
      } else {
        logger.debug(`[fix-loop] Wrote: ${iterPath} (${file.content.length} chars)`);
      }
    }

    // Step 2: ESLint
    const lintDir = workspace.taskLintedDir(task.id);
    const lintResult = await eslintAgent.run(codeFiles, lintDir);
    if (lintResult.ok) {
      codeFiles = lintResult.value;
    }

    // Step 3: QA
    const qaInput: AgentInput<QaInput> = {
      runId,
      taskId: task.id,
      payload: {
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description,
        codeFiles,
        testsDir: workspace.taskTestsDir(task.id),
        codeDir: workspace.taskCodeDir(task.id),
      },
      iteration,
    };

    const qaResult = await qaAgent.run(qaInput);
    if (!qaResult.ok) {
      logger.warn(`[fix-loop] QA agent failed for task ${task.id}: ${qaResult.error.message}`);
      lastErrors = [qaResult.error.message];
      lastCode = codeFiles;
      continue;
    }

    const qa = qaResult.value.payload;
    await writeJson(workspace.taskQaResultsPath(task.id), qa);

    if (qa.passed) {
      logger.info(`[fix-loop] Task ${task.id} passed QA on iteration ${iteration + 1}`);

      // Write final code
      logger.info(`[fix-loop] Writing ${codeFiles.length} final files for task ${task.id}`);
      for (const file of codeFiles) {
        const writePath = `${workspace.taskCodeDir(task.id)}/${file.path}`;
        const wr = await writeCode(writePath, file.content);
        if (!wr.ok) {
          logger.error(`[fix-loop] Failed to write final file ${writePath}: ${wr.error.message}`);
        }
      }

      await writeJson(workspace.taskStatusPath(task.id), {
        status: 'completed',
        iteration: iteration + 1,
      });

      return ok({
        taskId: task.id,
        status: 'completed',
        iteration: iteration + 1,
      });
    }

    // QA failed — prepare for next iteration
    logger.warn(`[fix-loop] Task ${task.id} failed QA (iteration ${iteration + 1}): ${qa.errors.length} errors`);
    lastErrors = qa.errors;
    lastCode = codeFiles;

    await writeJson(`${workspace.iterationDir(task.id, iteration)}/errors.json`, {
      errors: qa.errors,
      testOutput: qa.testOutput,
    });
  }

  // Exhausted iterations — write best-effort code
  logger.info(`[fix-loop] Writing ${lastCode.length} best-effort files for task ${task.id}`);
  for (const file of lastCode) {
    const writePath = `${workspace.taskCodeDir(task.id)}/${file.path}`;
    const wr = await writeCode(writePath, file.content);
    if (!wr.ok) {
      logger.error(`[fix-loop] Failed to write best-effort file ${writePath}: ${wr.error.message}`);
    }
  }

  await writeJson(workspace.taskStatusPath(task.id), {
    status: 'failed',
    iteration: config.maxIterations,
    lastError: `Exceeded ${config.maxIterations} fix iterations`,
  });

  return ok({
    taskId: task.id,
    status: 'failed',
    iteration: config.maxIterations,
    lastError: `Exceeded ${config.maxIterations} fix iterations`,
  });
}

async function gatherExistingCode(workspace: Workspace, task: Task): Promise<Result<string, Error>> {
  const parts: string[] = [];

  for (const depId of task.dependsOn) {
    const codeDir = workspace.taskCodeDir(depId);
    const result = await readAllCodeFiles(codeDir);
    if (result.ok) {
      for (const [fileName, content] of result.value) {
        parts.push(`// ${depId}/${fileName}\n${content}`);
      }
    }
  }

  if (parts.length === 0) {
    return err(new Error('No existing code found'));
  }

  return ok(parts.join('\n\n'));
}
