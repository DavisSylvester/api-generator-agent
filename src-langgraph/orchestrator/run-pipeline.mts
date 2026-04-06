import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Logger } from 'winston';
import type { EnvConfig } from '../config/env.mts';
import type { Task, TaskGraph } from '../types/task.mts';
import type { PipelineStateType } from '../graph/state.mts';
import { buildPipelineGraph } from '../graph/build-pipeline-graph.mts';
import { buildTaskGraph } from '../graph/build-task-graph.mts';

interface PipelineRunResult {
  readonly runId: string;
  readonly taskResults: PipelineStateType['taskResults'];
  readonly hoppscotchCollection: string;
  readonly durationMs: number;
}

export async function runPipeline(
  prdText: string,
  env: EnvConfig,
  logger: Logger,
): Promise<PipelineRunResult> {
  const startMs = performance.now();
  const runId = crypto.randomUUID();
  const workspaceDir = env.WORKSPACE_DIR;

  logger.info(`Starting LangGraph pipeline: ${runId}`);

  // Create workspace
  const rootDir = join(workspaceDir, runId);
  await mkdir(rootDir, { recursive: true });
  await mkdir(join(rootDir, 'docs'), { recursive: true });

  // Phase 1: Plan
  logger.info('Phase 1: Planning');
  const pipelineGraph = buildPipelineGraph();
  const planResult = await pipelineGraph.invoke(
    {
      prdText,
      runId,
      workspaceDir,
      maxIterations: env.MAX_FIX_ITERATIONS,
    },
    { configurable: { thread_id: `${runId}-plan` } },
  ) as PipelineStateType;

  if (planResult.error || !planResult.taskGraph) {
    logger.error(`Planning failed: ${planResult.error}`);
    return {
      runId,
      taskResults: [],
      hoppscotchCollection: '',
      durationMs: Math.round(performance.now() - startMs),
    };
  }

  const taskGraph: TaskGraph = planResult.taskGraph;
  logger.info(`Generated ${taskGraph.tasks.length} tasks`);

  // Save plan
  await writeFile(
    join(rootDir, 'plan.json'),
    JSON.stringify(taskGraph, null, 2),
    'utf-8',
  );

  // Phase 2: Execute tasks with dependency ordering
  logger.info('Phase 2: Executing tasks');
  const taskApp = buildTaskGraph();
  const completed = new Set<string>();
  const failed = new Set<string>();
  let allTaskResults: PipelineStateType['taskResults'] = [];

  const taskMap = new Map(taskGraph.tasks.map((t) => [t.id, t]));

  while (completed.size + failed.size < taskGraph.tasks.length) {
    const ready = taskGraph.tasks.filter((t) => {
      if (completed.has(t.id) || failed.has(t.id)) return false;
      const depsFailed = t.dependsOn.some((d) => failed.has(d));
      if (depsFailed) {
        failed.add(t.id);
        return false;
      }
      return t.dependsOn.every((d) => completed.has(d));
    });

    if (ready.length === 0) break;

    // Run ready tasks in parallel (up to concurrency limit)
    const batch = ready.slice(0, env.MAX_CONCURRENCY);
    const batchPromises = batch.map(async (task) => {
      logger.info(`Running task: ${task.id} (${task.name})`);

      await mkdir(join(rootDir, 'tasks', task.id), { recursive: true });

      const taskResult = await taskApp.invoke(
        {
          prdText,
          runId,
          taskGraph,
          currentTaskId: task.id,
          currentTaskName: task.name,
          currentTaskDescription: task.description,
          maxIterations: env.MAX_FIX_ITERATIONS,
          workspaceDir,
          iteration: 0,
          codeFiles: [],
          lintedCodeFiles: [],
          qaErrors: [],
          qaPassed: false,
          taskResults: [],
          allGeneratedCode: '',
          hoppscotchCollection: '',
          error: '',
        } satisfies PipelineStateType,
        { configurable: { thread_id: `${runId}-task-${task.id}` } },
      ) as PipelineStateType;

      return { task, result: taskResult };
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { task, result } of batchResults) {
      const taskResultEntry = result.taskResults[result.taskResults.length - 1];
      if (taskResultEntry && taskResultEntry.status === 'completed') {
        completed.add(task.id);
        logger.info(`Task ${task.id} completed`);
      } else {
        failed.add(task.id);
        logger.error(`Task ${task.id} failed`);
      }
      allTaskResults = [...allTaskResults, ...result.taskResults];
    }
  }

  // Phase 3: Documentation
  logger.info('Phase 3: Documentation');
  const docsResult = await pipelineGraph.invoke(
    {
      ...planResult,
      runId,
      taskGraph,
      taskResults: allTaskResults,
    },
    { configurable: { thread_id: `${runId}-docs` } },
  ) as PipelineStateType;

  if (docsResult.hoppscotchCollection) {
    await writeFile(
      join(rootDir, 'docs', 'hoppscotch-collection.json'),
      docsResult.hoppscotchCollection,
      'utf-8',
    );
    logger.info('Hoppscotch collection generated');
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info(`Pipeline complete in ${durationMs}ms`);

  return {
    runId,
    taskResults: allTaskResults,
    hoppscotchCollection: docsResult.hoppscotchCollection,
    durationMs,
  };
}
