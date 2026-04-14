import type { Task, TaskGraph, TaskState } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { getReadyTasks, getSkippedTasks } from './task-graph.mts';
import type { Logger } from 'winston';

export type TaskProcessor = (task: Task) => Promise<Result<TaskState, Error>>;

export interface ExecutorConfig {
  readonly maxConcurrency: number;
  readonly preCompleted?: ReadonlyMap<string, TaskState>;
  readonly signal?: AbortSignal;
}

export async function executeGraph(
  graph: TaskGraph,
  processTask: TaskProcessor,
  config: ExecutorConfig,
  logger: Logger,
): Promise<Map<string, TaskState>> {
  const completed = new Set<string>();
  const failed = new Set<string>();
  const results = new Map<string, TaskState>();

  // Pre-populate with previously completed tasks (for resume)
  if (config.preCompleted) {
    for (const [taskId, state] of config.preCompleted) {
      results.set(taskId, state);
      if (state.status === `completed`) {
        completed.add(taskId);
        logger.info(`[resume] Skipping completed task: ${taskId}`);
      } else if (state.status === `failed` || state.status === `skipped`) {
        failed.add(taskId);
      }
    }
  }

  const totalTasks = graph.tasks.length;

  // Map of taskId → in-flight promise (resolves when that task finishes)
  const inFlight = new Map<string, Promise<string>>();

  while (completed.size + failed.size < totalTasks) {
    // Check for abort
    if (config.signal?.aborted) {
      logger.warn(`[executor] Abort signal received — stopping pipeline`);
      // Mark all remaining tasks as skipped
      for (const task of graph.tasks) {
        if (!results.has(task.id)) {
          results.set(task.id, { taskId: task.id, status: `skipped`, iteration: 0, lastError: `Aborted by user` });
          failed.add(task.id);
        }
      }
      break;
    }

    // Mark skipped tasks (dependencies failed)
    const skipped = getSkippedTasks(graph, failed);
    for (const task of skipped) {
      if (!results.has(task.id)) {
        const state: TaskState = {
          taskId: task.id,
          status: `skipped`,
          iteration: 0,
          lastError: `Dependency failed`,
        };
        results.set(task.id, state);
        failed.add(task.id);
        logger.warn(`Skipping task ${task.id} (${task.name}) — dependency failed`);
      }
    }

    // Determine which tasks are ready (deps completed, not running/done/failed)
    const running = new Set(inFlight.keys());
    const ready = getReadyTasks(graph, completed, running, failed);

    // If nothing ready and nothing in flight, we are stuck or done
    if (ready.length === 0 && inFlight.size === 0) {
      break;
    }

    // Fill available concurrency slots with ready tasks
    const slotsAvailable = config.maxConcurrency - inFlight.size;
    const toStart = ready.slice(0, slotsAvailable);

    for (const task of toStart) {
      logger.info(`Starting task ${task.id} (${task.name})`);

      const promise = (async (): Promise<string> => {
        const result = await processTask(task);

        if (result.ok) {
          const state = result.value;
          results.set(task.id, state);

          if (state.status === `completed`) {
            completed.add(task.id);
            logger.info(`Completed task ${task.id} (${task.name})`);
          } else {
            failed.add(task.id);
            logger.error(`Failed task ${task.id} (${task.name}): ${state.lastError ?? `unknown`}`);
          }
        } else {
          const state: TaskState = {
            taskId: task.id,
            status: `failed`,
            iteration: 0,
            lastError: result.error.message,
          };
          results.set(task.id, state);
          failed.add(task.id);
          logger.error(`Failed task ${task.id} (${task.name}): ${result.error.message}`);
        }

        return task.id;
      })();

      inFlight.set(task.id, promise);
    }

    // If we started new tasks but still have capacity left and no more ready tasks,
    // or if we couldn't start anything, wait for at least one task to complete.
    if (inFlight.size > 0) {
      const finishedId = await Promise.race(inFlight.values());
      inFlight.delete(finishedId);
    }
  }

  return results;
}
