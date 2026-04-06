import type { TaskGraph } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { CycleError } from './cycle-error.mts';

export function validateGraph(graph: TaskGraph): Result<void, CycleError> {
  const taskIds = new Set(graph.tasks.map((t) => t.id));

  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        return err(new CycleError([dep, task.id]));
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const taskMap = new Map(graph.tasks.map((t) => [t.id, t]));

  function dfs(taskId: string, path: string[]): CycleError | undefined {
    if (inStack.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      return new CycleError([...path.slice(cycleStart), taskId]);
    }
    if (visited.has(taskId)) {
      return undefined;
    }

    visited.add(taskId);
    inStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const dep of task.dependsOn) {
        const cycleErr = dfs(dep, [...path, taskId]);
        if (cycleErr) {
          return cycleErr;
        }
      }
    }

    inStack.delete(taskId);
    return undefined;
  }

  for (const task of graph.tasks) {
    const cycleErr = dfs(task.id, []);
    if (cycleErr) {
      return err(cycleErr);
    }
  }

  return ok(undefined);
}
