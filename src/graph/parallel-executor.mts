import type { Task, TaskGraph, TaskState } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { getReadyTasks, getSkippedTasks } from './task-graph.mts';
import type { Logger } from 'winston';

export type TaskProcessor = (task: Task) => Promise<Result<TaskState, Error>>;

export interface ExecutorConfig {
  readonly maxConcurrency: number;
}

export async function executeGraph(
  graph: TaskGraph,
  processTask: TaskProcessor,
  config: ExecutorConfig,
  logger: Logger,
): Promise<Map<string, TaskState>> {
  const completed = new Set<string>();
  const running = new Set<string>();
  const failed = new Set<string>();
  const results = new Map<string, TaskState>();

  const totalTasks = graph.tasks.length;

  while (completed.size + failed.size < totalTasks) {
    const skipped = getSkippedTasks(graph, failed);
    for (const task of skipped) {
      if (!results.has(task.id)) {
        const state: TaskState = {
          taskId: task.id,
          status: 'skipped',
          iteration: 0,
          lastError: 'Dependency failed',
        };
        results.set(task.id, state);
        failed.add(task.id);
        logger.warn(`Skipping task ${task.id} (${task.name}) — dependency failed`);
      }
    }

    const ready = getReadyTasks(graph, completed, running, failed);

    if (ready.length === 0 && running.size === 0) {
      break;
    }

    const slotsAvailable = config.maxConcurrency - running.size;
    const toStart = ready.slice(0, slotsAvailable);

    if (toStart.length === 0 && running.size > 0) {
      await waitForAny(running, results);
      continue;
    }

    const promises = toStart.map(async (task) => {
      running.add(task.id);
      logger.info(`Starting task ${task.id} (${task.name})`);

      const result = await processTask(task);

      running.delete(task.id);

      if (result.ok) {
        const state = result.value;
        results.set(task.id, state);

        if (state.status === 'completed') {
          completed.add(task.id);
          logger.info(`Completed task ${task.id} (${task.name})`);
        } else {
          failed.add(task.id);
          logger.error(`Failed task ${task.id} (${task.name}): ${state.lastError ?? 'unknown'}`);
        }
      } else {
        const state: TaskState = {
          taskId: task.id,
          status: 'failed',
          iteration: 0,
          lastError: result.error.message,
        };
        results.set(task.id, state);
        failed.add(task.id);
        logger.error(`Failed task ${task.id} (${task.name}): ${result.error.message}`);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

async function waitForAny(
  running: ReadonlySet<string>,
  _results: Map<string, TaskState>,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
