import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { runPipeline } from './orchestrator/pipeline.mts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadPrd(input: string): Promise<{ prdText: string; source: string }> {
  // "-" means read from stdin
  if (input === '-') {
    const prdText = await readStdin();
    return { prdText, source: 'stdin' };
  }

  // Try as a file path first
  const resolvedPath = resolve(input);
  if (await isFile(resolvedPath)) {
    const prdText = await readFile(resolvedPath, 'utf-8');
    return { prdText, source: resolvedPath };
  }

  // Not a file — treat the input as raw PRD text
  return { prdText: input, source: 'inline text' };
}

interface CliFlags {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): { flags: CliFlags; positional: string[] } {
  const flags: CliFlags = { dryRun: false, verbose: false, quiet: false };
  const positional: string[] = [];

  for (const arg of argv) {
    switch (arg) {
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--verbose':
        flags.verbose = true;
        break;
      case '--quiet':
        flags.quiet = true;
        break;
      default:
        positional.push(arg);
    }
  }

  return { flags, positional };
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const prdInput = positional[0];
  const maxIterations = positional[1] ? parseInt(positional[1], 10) : undefined;
  const maxTasks = positional[2] ? parseInt(positional[2], 10) : undefined;

  if (!prdInput) {
    console.error('Usage: bun run src/index.mts [options] <prd-file-or-text> [max-iterations] [max-tasks]');
    console.error('');
    console.error('Arguments:');
    console.error('  prd-file-or-text  Path to a PRD file, raw PRD text, or "-" for stdin');
    console.error('  max-iterations    Max fix loop iterations (default: 5)');
    console.error('  max-tasks         Max tasks to run (default: all)');
    console.error('');
    console.error('Options:');
    console.error('  --dry-run         Show the task plan without executing');
    console.error('  --verbose         Enable debug-level logging');
    console.error('  --quiet           Only show warnings and errors');
    console.error('');
    console.error('Examples:');
    console.error('  bun run src/index.mts my-api-prd.md');
    console.error('  bun run src/index.mts --dry-run sample-prd.md');
    console.error('  bun run src/index.mts "Build a notes API with auth and CRUD endpoints"');
    console.error('  cat prd.md | bun run src/index.mts -');
    process.exit(1);
  }

  const env = loadEnv();

  const container = createContainer(env);
  const { logger, pipelineConfig } = container;

  // Apply log level from CLI flags
  if (flags.verbose) {
    logger.level = 'debug';
  } else if (flags.quiet) {
    logger.level = 'warn';
  }

  let prdText: string;
  try {
    const loaded = await loadPrd(prdInput);
    prdText = loaded.prdText;
    logger.info(`PRD loaded from ${loaded.source} (${prdText.length} chars)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to load PRD: ${msg}`);
    process.exit(1);
  }

  if (prdText.trim().length === 0) {
    logger.error('PRD input is empty');
    process.exit(1);
  }

  logger.info(`Config: maxIterations=${pipelineConfig.maxFixIterations}, concurrency=${pipelineConfig.maxConcurrency}`);
  logger.info(`LLM provider: ${pipelineConfig.llmProvider}${pipelineConfig.llmProviderHost ? ` (${pipelineConfig.llmProviderHost})` : ''}`);

  let effectiveConfig = maxIterations !== undefined && !isNaN(maxIterations)
    ? { ...pipelineConfig, maxFixIterations: maxIterations }
    : { ...pipelineConfig };

  if (maxTasks !== undefined && !isNaN(maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks };
    logger.info(`Max tasks: ${maxTasks}`);
  }

  if (flags.dryRun) {
    logger.info('=== Dry Run Mode ===');
    logger.info('Planning only — no code generation or testing will be performed.');
    const planResult = await container.planningAgent.run({
      runId: crypto.randomUUID(),
      payload: prdText,
      iteration: 0,
    });
    if (!planResult.ok) {
      logger.error(`Planning failed: ${planResult.error.message}`);
      process.exit(1);
    }
    const tasks = planResult.value.payload.tasks;
    logger.info(`Plan: ${tasks.length} tasks`);
    for (const task of tasks) {
      logger.info(`  [${task.type}] ${task.id} — "${task.name}" (depends: [${task.dependsOn.join(', ')}])`);
    }
    process.exit(0);
  }

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
    costTracker: container.costTracker,
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
  logger.info(`Report: .workspace/${pipeline.runId}/report.md`);

  // Cost summary
  const costSummary = container.costTracker.getSummary();
  logger.info(`=== Cost Summary ===`);
  logger.info(`LLM calls: ${costSummary.callCount}`);
  logger.info(`Tokens: ${costSummary.totalInputTokens.toLocaleString()} input, ${costSummary.totalOutputTokens.toLocaleString()} output`);
  logger.info(`Total cost: $${costSummary.totalCost.toFixed(4)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
