import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { runPipeline } from './orchestrator/pipeline.mts';
import { parseArgs, printHelp } from './cli/parse-args.mts';
import { listRuns } from './cli/list-runs.mts';
import { showStatus } from './cli/show-status.mts';

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.command === `help`) {
    printHelp();
    process.exit(0);
  }

  const env = loadEnv();

  if (options.command === `list-runs`) {
    await listRuns(env.WORKSPACE_DIR);
    process.exit(0);
  }

  if (options.command === `status`) {
    await showStatus(env.WORKSPACE_DIR, options.statusRunId!);
    process.exit(0);
  }

  // Command is `run` — need either --prd or --resume
  const container = createContainer(env);
  const { logger, pipelineConfig } = container;

  // Build effective config from CLI flags + env defaults
  let effectiveConfig = { ...pipelineConfig };

  if (options.iterations !== undefined && !isNaN(options.iterations)) {
    effectiveConfig = { ...effectiveConfig, maxFixIterations: options.iterations };
  }

  if (options.maxTasks !== undefined && !isNaN(options.maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks: options.maxTasks };
    logger.info(`Max tasks: ${options.maxTasks}`);
  }

  if (options.concurrency !== undefined && !isNaN(options.concurrency)) {
    effectiveConfig = { ...effectiveConfig, maxConcurrency: options.concurrency };
  }

  if (options.noDiagrams) {
    effectiveConfig = { ...effectiveConfig, skipDiagrams: true };
  }

  if (options.noDocs) {
    effectiveConfig = { ...effectiveConfig, skipDocs: true };
  }

  if (options.resume) {
    effectiveConfig = { ...effectiveConfig, resumeRunId: options.resume };
  }

  // Load PRD text (required for new runs, optional for resume)
  let prdText = ``;
  if (options.prd) {
    const resolvedPath = resolve(options.prd);
    logger.info(`Reading PRD from: ${resolvedPath}`);
    try {
      prdText = await readFile(resolvedPath, 'utf-8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to read PRD file: ${msg}`);
      process.exit(1);
    }
    logger.info(`PRD loaded (${prdText.length} chars)`);
  } else if (!options.resume) {
    logger.error(`No PRD file specified. Use --prd <file> or --resume <run-id>.`);
    process.exit(1);
  }

  logger.info(`Config: maxIterations=${effectiveConfig.maxFixIterations}, concurrency=${effectiveConfig.maxConcurrency}`);
  logger.info(`LLM provider: Ollama (${effectiveConfig.ollamaHost})`);

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger,
    fallbackTiers: container.fallbackTiers,
    localFactory: container.localFactory,
    notifier: container.notifier,
  });

  if (!result.ok) {
    logger.error(`Pipeline failed: ${result.error.message}`);
    process.exit(1);
  }

  const pipeline = result.value;
  logger.info('=== Pipeline Results ===');
  logger.info(`Run ID: ${pipeline.runId}`);
  logger.info(`Duration: ${pipeline.durationMs}ms`);
  logger.info(`Documentation: ${pipeline.documentationGenerated ? 'generated' : 'not generated'}`);

  const completed = pipeline.taskStates.filter((s) => s.status === 'completed').length;
  const failed = pipeline.taskStates.filter((s) => s.status === 'failed').length;
  const skipped = pipeline.taskStates.filter((s) => s.status === 'skipped').length;

  logger.info(`Tasks: ${completed} completed, ${failed} failed, ${skipped} skipped`);

  for (const state of pipeline.taskStates) {
    const icon = state.status === 'completed' ? 'OK' : state.status === 'failed' ? 'FAIL' : 'SKIP';
    logger.info(`  [${icon}] ${state.taskId} (${state.iteration} iterations)${state.lastError ? ` — ${state.lastError}` : ''}`);
  }

  logger.info(`Workspace: .workspace/${pipeline.runId}/`);

  if (failed > 0) {
    const completedIds = pipeline.taskStates.filter((s) => s.status === `completed`).map((s) => s.taskId);
    if (completedIds.length > 0) {
      logger.info(`Resume with: bun run src/index.mts --resume ${pipeline.runId}`);
    }
  }

  const hardFailures = pipeline.taskStates.filter((s) => s.lastError?.includes(`HARD FAILURE`));
  if (hardFailures.length > 0) {
    logger.error(`\n${'='.repeat(60)}`);
    logger.error(`HARD FAILURE — ${hardFailures.length} task(s) need human help:`);
    for (const hf of hardFailures) {
      logger.error(`  - ${hf.taskId}: ${hf.lastError}`);
    }
    logger.error(`${'='.repeat(60)}`);
    process.exit(2);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
