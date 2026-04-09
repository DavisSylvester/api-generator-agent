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
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { CODEGEN_SYSTEM_PROMPT } from '../prompts/codegen-system-prompt.mts';
import { createCodegenUserPrompt } from '../prompts/create-codegen-user-prompt.mts';
import { createFixPrompt } from '../prompts/create-fix-prompt.mts';
import { validateImports, validateNamedExports } from '../validators/import-validator.mts';
import { extractExports } from '../validators/extract-exports.mts';

export interface FixLoopConfig {
  readonly maxIterations: number;
  readonly integrationPort: number;
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
  let depCodeFiles: readonly CodeFile[] = [];
  const passingTests = new Set<string>();

  const knowledgePath = workspace.taskQaKnowledgePath(task.id);

  const completedCodeResult = await gatherExistingCode(workspace, task);
  if (completedCodeResult.ok) {
    existingCodeContext = completedCodeResult.value.context;
    depCodeFiles = completedCodeResult.value.files;
  }

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    const iterStartMs = performance.now();
    logger.info(`[fix-loop] ── Task "${task.name}" (${task.id}) — iteration ${iteration + 1}/${config.maxIterations} ──`);
    await workspace.initIteration(task.id, iteration);

    const iterDir = workspace.iterationDir(task.id, iteration);

    // Write iteration start marker
    await writeJson(`${iterDir}/start.json`, {
      taskId: task.id,
      iteration: iteration + 1,
      startedAt: new Date().toISOString(),
      mode: iteration === 0 ? 'generate' : 'fix',
      previousErrors: iteration > 0 ? lastErrors.length : 0,
    });

    // Step 1: CodeGen
    logger.info(`[fix-loop] Step 1/3: CodeGen (${iteration === 0 ? 'generate' : 'fix'} mode)`);
    const codegenStartMs = performance.now();
    // Read QA knowledge to include actionable fix instructions with errors
    let knowledgeContext: readonly string[] = [];
    if (iteration > 0) {
      try {
        const knowledge = await readFile(knowledgePath, `utf-8`);
        if (knowledge.trim().length > 0) {
          knowledgeContext = [`\n--- QA Knowledge (apply these lessons) ---\n${knowledge}`];
        }
      } catch {
        // No knowledge file yet
      }
    }

    const codegenInput: CodegenInput = iteration === 0
      ? {
          taskName: task.name,
          taskDescription: task.description,
          taskType: task.type,
          taskId: task.id,
          mode: `generate`,
          existingCode: existingCodeContext,
        }
      : {
          taskName: task.name,
          taskDescription: task.description,
          taskType: task.type,
          taskId: task.id,
          mode: `fix`,
          previousCode: lastCode.map((f) => `// ${f.path}\n${f.content}`).join(`\n\n`),
          errors: [...lastErrors, ...knowledgeContext],
          existingCode: existingCodeContext,
        };

    // Capture the user prompt for iteration logging
    const capturedUserPrompt = iteration === 0
      ? createCodegenUserPrompt(task.name, task.description, existingCodeContext, task.type, task.id)
      : createFixPrompt(
          task.name,
          task.description,
          lastCode.map((f) => `// ${f.path}\n${f.content}`).join(`\n\n`),
          [...lastErrors, ...knowledgeContext],
          task.type,
          existingCodeContext,
          task.id,
        );

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

    const allFiles = codegenResult.value.payload;
    const codegenDurationMs = Math.round(performance.now() - codegenStartMs);
    logger.info(`[fix-loop] Step 1/3: CodeGen completed in ${codegenDurationMs}ms — ${allFiles.length} files (model: ${codegenResult.value.modelUsed})`);

    // Separate test files from code files
    const testFiles = allFiles.filter((f) => f.path.includes(`.test.mts`) || f.path.includes(`.test.ts`));
    let codeFiles: readonly CodeFile[] = allFiles.filter((f) => !f.path.includes(`.test.mts`) && !f.path.includes(`.test.ts`));

    if (testFiles.length > 0) {
      logger.info(`[fix-loop] Codegen produced ${testFiles.length} test file(s) and ${codeFiles.length} code files`);
      // Write test files to the task tests directory
      for (const tf of testFiles) {
        // Normalize test file name: use just the filename, not the full path
        const testFileName = tf.path.includes(`/`) ? tf.path.substring(tf.path.lastIndexOf(`/`) + 1) : tf.path;
        const testPath = `${workspace.taskTestsDir(task.id)}/${testFileName}`;
        await writeCode(testPath, tf.content);
        logger.info(`[fix-loop] Wrote test file: ${testPath} (${tf.content.length} chars)`);
      }
    } else {
      logger.warn(`[fix-loop] Codegen did not produce any test files`);
    }

    // Write codegen summary
    await writeJson(`${iterDir}/codegen-result.json`, {
      durationMs: codegenDurationMs,
      model: codegenResult.value.modelUsed,
      fileCount: codeFiles.length,
      files: codeFiles.map((f) => ({ path: f.path, chars: f.content.length })),
    });

    // Write prompt iteration log
    const iterationNumber = iteration + 1;
    const mode = iteration === 0 ? `generate` : `fix`;
    const issuesSection = iteration > 0
      ? lastErrors.map((e, i) => `${i + 1}. ${e}`).join(`\n`)
      : `Initial generation`;
    const filesListing = codeFiles
      .map((f) => `  - \`${f.path}\` (${f.content.length} chars)`)
      .join(`\n`);
    const knowledgeSection = knowledgeContext.length > 0
      ? knowledgeContext.join(`\n`)
      : `None`;
    const promptIterationMd = [
      `# Prompt Iteration ${iterationNumber}`,
      `**Task:** ${task.name} (${task.id})`,
      `**Mode:** ${mode}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Duration:** ${codegenDurationMs}ms`,
      `**Model:** ${codegenResult.value.modelUsed}`,
      ``,
      `## Issues Being Resolved`,
      issuesSection,
      ``,
      `## System Prompt`,
      `\`\`\``,
      CODEGEN_SYSTEM_PROMPT,
      `\`\`\``,
      ``,
      `## User Prompt`,
      `\`\`\``,
      capturedUserPrompt.substring(0, 50000),
      `\`\`\``,
      ``,
      `## Codegen Response Summary`,
      `- Files generated: ${codeFiles.length}`,
      filesListing,
      ``,
      `## QA Knowledge Applied`,
      knowledgeSection,
    ].join(`\n`);

    await writeFile(`${iterDir}/prompt-iteration-${iterationNumber}.md`, promptIterationMd, `utf-8`);

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
    logger.info('[fix-loop] Step 2/3: ESLint');
    const lintStartMs = performance.now();
    const lintDir = workspace.taskLintedDir(task.id);
    const lintResult = await eslintAgent.run(codeFiles, lintDir);
    const lintDurationMs = Math.round(performance.now() - lintStartMs);

    if (lintResult.ok) {
      codeFiles = lintResult.value;
      logger.info(`[fix-loop] Step 2/3: ESLint completed in ${lintDurationMs}ms — ${codeFiles.length} files passed`);
    } else {
      logger.warn(`[fix-loop] Step 2/3: ESLint had issues in ${lintDurationMs}ms, continuing with unlinted code`);
    }

    await writeJson(`${iterDir}/eslint-result.json`, {
      durationMs: lintDurationMs,
      passed: lintResult.ok,
      fileCount: codeFiles.length,
    });

    // Import validation — catch missing/wrong module paths before QA
    const importErrors = validateImports(codeFiles, [...depCodeFiles], logger);
    if (importErrors.length > 0) {
      logger.warn(`[fix-loop] Import validation found ${importErrors.length} issues — skipping QA`);
      await writeJson(`${iterDir}/import-errors.json`, importErrors);
      lastErrors = importErrors.map((e) =>
        e.type === `wrong-path`
          ? `Import error in ${e.sourceFile}: "${e.importPath}" not found. Change to "${e.suggestion}"`
          : e.type === `missing-barrel`
            ? `Missing barrel file: ${e.resolvedPath}. Create an index.mts that re-exports all sibling modules in that directory.`
            : `Import error in ${e.sourceFile}: "${e.importPath}" does not exist. Generate this file or fix the import.`,
      );
      lastCode = codeFiles.map((f) => ({ path: f.path.replace(/^(src\/)+/, `src/`), content: f.content }));
      continue;
    }

    // Named export validation — catch mismatched imports/re-exports before QA
    const allCodeForValidation = [...codeFiles, ...depCodeFiles];
    const exportErrors = validateNamedExports(allCodeForValidation, logger);
    if (exportErrors.length > 0) {
      logger.warn(`[fix-loop] Named export validation found ${exportErrors.length} issues — skipping QA`);
      await writeJson(`${iterDir}/import-export-errors.json`, exportErrors);
      lastErrors = exportErrors.map((e) =>
        `File '${e.sourceFile}' imports/re-exports '${e.importedName}' from '${e.fromFile}', but that file exports: [${e.actualExports.join(', ')}]. Fix the import or barrel to match actual exports.`,
      );
      lastCode = codeFiles.map((f) => ({ path: f.path.replace(/^(src\/)+/, `src/`), content: f.content }));
      continue;
    }

    // Copy shared output (dependency code) into the current task's code dir
    // so that test imports referencing upstream code can resolve at runtime
    logger.info(`[fix-loop] Copying shared output into task code dir for dependency resolution`);
    const sharedResult = await readAllCodeFiles(workspace.outputDir());
    if (sharedResult.ok) {
      for (const [relPath, content] of sharedResult.value) {
        const destPath = `${workspace.taskCodeDir(task.id)}/${relPath}`;
        // Only copy if the current task didn't generate this file
        const currentTaskHasFile = codeFiles.some((f) => f.path === relPath);
        if (!currentTaskHasFile) {
          await writeCode(destPath, content);
        }
      }
    }

    // Write current task's code files into its code dir so QA can find them
    for (const file of codeFiles) {
      const codePath = `${workspace.taskCodeDir(task.id)}/${file.path}`;
      await writeCode(codePath, file.content);
    }

    // Step 3: QA (always runOnly — codegen generates tests)
    logger.info(`[fix-loop] Step 3/3: QA (runOnly mode, iteration ${iteration + 1})`);

    // Extract available exports from generated + dependency code so QA only imports real names
    const allCodeForExports = [...codeFiles, ...depCodeFiles];
    const exportInfos = extractExports(allCodeForExports);
    const availableExports = exportInfos.map((e) =>
      e.kind === 'type' || e.kind === 'interface'
        ? `${e.kind} ${e.name} (from ${e.file})`
        : `${e.name} (from ${e.file})`,
    );
    logger.info(`[fix-loop] Extracted ${exportInfos.length} exports for QA constraint`);

    const qaStartMs = performance.now();
    const qaInput: AgentInput<QaInput> = {
      runId,
      taskId: task.id,
      payload: {
        taskId: task.id,
        taskName: task.name,
        taskDescription: task.description,
        taskType: task.type,
        codeFiles,
        testsDir: workspace.taskTestsDir(task.id),
        codeDir: workspace.taskCodeDir(task.id),
        integrationDir: workspace.taskIntegrationDir(task.id),
        knowledgePath,
        mode: `runOnly`,
        port: config.integrationPort,
        testScope: `unit-only`,
        availableExports,
      },
      iteration,
    };

    const qaResult = await qaAgent.run(qaInput);
    const qaDurationMs = Math.round(performance.now() - qaStartMs);

    if (!qaResult.ok) {
      logger.warn(`[fix-loop] Step 3/3: QA agent failed in ${qaDurationMs}ms for task ${task.id}: ${qaResult.error.message}`);
      await writeJson(`${iterDir}/qa-result.json`, {
        durationMs: qaDurationMs,
        passed: false,
        agentError: qaResult.error.message,
      });
      lastErrors = [qaResult.error.message];
      lastCode = codeFiles.map((f) => ({
        path: f.path.replace(/^(src\/)+/, `src/`),
        content: f.content,
      }));
      continue;
    }

    const qa = qaResult.value.payload;

    logger.info(`[fix-loop] Step 3/3: QA completed in ${qaDurationMs}ms — unit: ${qa.unit.passed ? `PASS` : `FAIL`}`);

    await writeJson(workspace.taskQaResultsPath(task.id), qa);
    await writeJson(`${iterDir}/qa-result.json`, {
      durationMs: qaDurationMs,
      model: qaResult.value.modelUsed,
      passed: qa.passed,
      unitPassed: qa.unit.passed,
      unitErrors: qa.unit.errors.length,
      integrationPassed: qa.integration.passed,
      integrationErrors: qa.integration.errors.length,
    });

    const iterDurationMs = Math.round(performance.now() - iterStartMs);

    if (qa.passed) {
      logger.info(`[fix-loop] Task ${task.id} passed QA on iteration ${iteration + 1} (total: ${iterDurationMs}ms)`);

      // Write final code
      logger.info(`[fix-loop] Writing ${codeFiles.length} final files for task ${task.id}`);
      for (const file of codeFiles) {
        const writePath = `${workspace.taskCodeDir(task.id)}/${file.path}`;
        const wr = await writeCode(writePath, file.content);
        if (!wr.ok) {
          logger.error(`[fix-loop] Failed to write final file ${writePath}: ${wr.error.message}`);
        }
      }

      // Copy completed code to shared output so downstream tasks can import it
      logger.info(`[fix-loop] Copying ${codeFiles.length} files to shared output dir`);
      for (const file of codeFiles) {
        const outputPath = `${workspace.outputDir()}/${file.path}`;
        await writeCode(outputPath, file.content);
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
    logger.warn(`[fix-loop] Task ${task.id} failed QA (iteration ${iteration + 1}, ${iterDurationMs}ms): ${qa.errors.length} errors`);
    if (qa.unit.errors.length > 0) {
      logger.warn(`[fix-loop]   Unit test errors (${qa.unit.errors.length}):`);
      for (const error of qa.unit.errors.slice(0, 5)) {
        logger.warn(`[fix-loop]     - ${error.substring(0, 200)}`);
      }
    }
    if (qa.integration.errors.length > 0) {
      logger.warn(`[fix-loop]   Integration test errors (${qa.integration.errors.length}):`);
      for (const error of qa.integration.errors.slice(0, 5)) {
        logger.warn(`[fix-loop]     - ${error.substring(0, 200)}`);
      }
    }
    const prefixedUnitErrors = qa.unit.errors.map((e, i) => `Unit Error ${i + 1}: ${e}`);
    const allQaErrors = [...prefixedUnitErrors, ...qa.integration.errors];

    // Detect regressions — tests that were passing before but now fail
    const currentPassing = extractPassingTestNames(qa.unit.output);
    const regressionWarnings: string[] = [];

    if (passingTests.size > 0) {
      for (const testName of passingTests) {
        if (!currentPassing.has(testName)) {
          const warning = `REGRESSION: Test '${testName}' was previously passing but now fails. Do NOT change code that was working. Only fix the failing tests.`;
          regressionWarnings.push(warning);
          logger.warn(`[fix-loop] ${warning}`);
        }
      }
    }

    // Update the passing tests set with currently passing tests
    for (const testName of currentPassing) {
      passingTests.add(testName);
    }

    // Include raw test output so codegen sees actual vs expected diffs
    const rawOutputContext = qa.unit.output.length > 0
      ? [`\n--- Full Unit Test Output (shows actual vs expected values) ---\n${qa.unit.output.substring(0, 8000)}`]
      : [];

    lastErrors = allQaErrors.length > 0
      ? [...regressionWarnings, ...allQaErrors, ...rawOutputContext]
      : [`Tests failed with exit code non-zero. Full output:\n${qa.testOutput.substring(0, 8000)}`];
    // Include both code and test files so the fix prompt sees everything
    const allLastFiles = [...codeFiles, ...testFiles];
    lastCode = allLastFiles.map((f) => ({
      path: f.path.replace(/^(src\/)+/, `src/`),
      content: f.content,
    }));

    await writeJson(`${iterDir}/errors.json`, {
      errors: qa.errors,
      unitOutput: qa.unit.output.substring(0, 5000),
      integrationOutput: qa.integration.output.substring(0, 5000),
    });

    // Write iteration completion summary
    await writeJson(`${iterDir}/complete.json`, {
      iteration: iteration + 1,
      durationMs: iterDurationMs,
      completedAt: new Date().toISOString(),
      result: 'failed',
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

  // Copy best-effort code to shared output so downstream tasks can still reference it
  logger.info(`[fix-loop] Copying ${lastCode.length} best-effort files to shared output dir`);
  for (const file of lastCode) {
    const outputPath = `${workspace.outputDir()}/${file.path}`;
    await writeCode(outputPath, file.content);
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

interface ExistingCode {
  readonly context: string;
  readonly files: readonly CodeFile[];
}

function extractPassingTestNames(output: string): Set<string> {
  const passing = new Set<string>();
  const lines = output.split(`\n`);

  for (const line of lines) {
    const trimmed = line.trim();

    // Match bun test passing patterns: "✓ test name" or "(pass) test name"
    const checkMatch = /^✓\s+(.+)$/.exec(trimmed);
    if (checkMatch?.[1]) {
      passing.add(checkMatch[1].trim());
      continue;
    }

    const passMatch = /^\(pass\)\s+(.+)$/.exec(trimmed);
    if (passMatch?.[1]) {
      passing.add(passMatch[1].trim());
    }
  }

  return passing;
}

async function gatherExistingCode(workspace: Workspace, task: Task): Promise<Result<ExistingCode, Error>> {
  const parts: string[] = [];
  const files: CodeFile[] = [];

  for (const depId of task.dependsOn) {
    const codeDir = workspace.taskCodeDir(depId);
    const result = await readAllCodeFiles(codeDir);
    if (result.ok) {
      for (const [fileName, content] of result.value) {
        parts.push(`// ${depId}/${fileName}\n${content}`);
        files.push({ path: fileName, content });
      }
    }
  }

  if (parts.length === 0) {
    return err(new Error(`No existing code found`));
  }

  return ok({ context: parts.join(`\n\n`), files });
}
