import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import winston from 'winston';
import { loadEnv } from './config/env.mts';
import { runPipeline } from './orchestrator/run-pipeline.mts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'visualize') {
    const { visualizePipelineGraph, visualizeTaskGraph } = await import('./graph/visualize.mts');
    const mode = args[1] ?? 'both';

    if (mode === 'pipeline' || mode === 'both') {
      console.log('## Pipeline Graph\n');
      console.log('```mermaid');
      console.log(visualizePipelineGraph());
      console.log('```\n');
    }

    if (mode === 'task' || mode === 'both') {
      console.log('## Task Fix-Loop Graph\n');
      console.log('```mermaid');
      console.log(visualizeTaskGraph());
      console.log('```\n');
    }

    return;
  }

  const prdPath = args[0];
  const maxIterations = args[1] ? parseInt(args[1], 10) : undefined;

  if (!prdPath) {
    console.error('Usage:');
    console.error('  bun run src-langgraph/index.mts <prd-file> [max-iterations]');
    console.error('  bun run src-langgraph/index.mts visualize [pipeline|task|both]');
    console.error('');
    console.error('Commands:');
    console.error('  <prd-file>     Run the full pipeline on a PRD');
    console.error('  visualize      Output LangGraph Mermaid diagrams');
    process.exit(1);
  }

  const env = loadEnv();

  if (maxIterations !== undefined && !isNaN(maxIterations)) {
    (env as { MAX_FIX_ITERATIONS: number }).MAX_FIX_ITERATIONS = maxIterations;
  }

  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: 'api-generator-langgraph' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 1
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${String(timestamp)} [${level}] ${String(message)}${metaStr}`;
          }),
        ),
      }),
    ],
  });

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
  logger.info(`Config: maxIterations=${env.MAX_FIX_ITERATIONS}, concurrency=${env.MAX_CONCURRENCY}`);

  const result = await runPipeline(prdText, env, logger);

  logger.info('=== Pipeline Results ===');
  logger.info(`Run ID: ${result.runId}`);
  logger.info(`Duration: ${result.durationMs}ms`);
  logger.info(`Documentation: ${result.hoppscotchCollection ? 'generated' : 'not generated'}`);

  const completed = result.taskResults.filter((t) => t.status === 'completed').length;
  const failedCount = result.taskResults.filter((t) => t.status === 'failed').length;

  logger.info(`Tasks: ${completed} completed, ${failedCount} failed`);

  for (const tr of result.taskResults) {
    const icon = tr.status === 'completed' ? 'OK' : 'FAIL';
    logger.info(`  [${icon}] ${tr.taskId} (${tr.iteration} iterations)${tr.lastError ? ` — ${tr.lastError}` : ''}`);
  }

  logger.info(`Workspace: .workspace/${result.runId}/`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
