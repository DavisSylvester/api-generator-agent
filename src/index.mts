import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { runPipeline } from './orchestrator/pipeline.mts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prdPath = args[0];
  const maxIterations = args[1] ? parseInt(args[1], 10) : undefined;
  const maxTasks = args[2] ? parseInt(args[2], 10) : undefined;

  if (!prdPath) {
    console.error('Usage: bun run src/index.mts <prd-file> [max-iterations] [max-tasks]');
    console.error('');
    console.error('Arguments:');
    console.error('  prd-file         Path to the PRD markdown/text file');
    console.error('  max-iterations   Max fix loop iterations (default: 5)');
    console.error('  max-tasks        Max tasks to run (default: all)');
    process.exit(1);
  }

  const env = loadEnv();

  const container = createContainer(env);
  const { logger, pipelineConfig } = container;

  const resolvedPath = resolve(prdPath);
  logger.info(`Reading PRD from: ${resolvedPath}`);

  let prdText: string;
  try {
    prdText = await readFile(resolvedPath, 'utf-8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to read PRD file: ${msg}`);
    process.exit(1);
  }

  logger.info(`PRD loaded (${prdText.length} chars)`);
  logger.info(`Config: maxIterations=${pipelineConfig.maxFixIterations}, concurrency=${pipelineConfig.maxConcurrency}`);
  logger.info(`LLM provider: Ollama (${pipelineConfig.ollamaHost})`);

  let effectiveConfig = maxIterations !== undefined && !isNaN(maxIterations)
    ? { ...pipelineConfig, maxFixIterations: maxIterations }
    : { ...pipelineConfig };

  if (maxTasks !== undefined && !isNaN(maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks };
    logger.info(`Max tasks: ${maxTasks}`);
  }

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger,
    fallbackTiers: container.fallbackTiers,
    localFactory: container.localFactory,
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

  const hardFailures = pipeline.taskStates.filter((s) => s.lastError?.includes(`HARD FAILURE`));
  if (hardFailures.length > 0) {
    logger.error(`\n${'═'.repeat(60)}`);
    logger.error(`HARD FAILURE — ${hardFailures.length} task(s) need human help:`);
    for (const hf of hardFailures) {
      logger.error(`  - ${hf.taskId}: ${hf.lastError}`);
    }
    logger.error(`${'═'.repeat(60)}`);
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
