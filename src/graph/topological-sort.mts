import type { Task, TaskGraph } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { CycleError } from './cycle-error.mts';
import { validateGraph } from './validate-graph.mts';

export function topologicalSort(graph: TaskGraph): Result<readonly Task[], CycleError> {
  const validation = validateGraph(graph);
  if (!validation.ok) {
    return err(validation.error);
  }

  const taskMap = new Map(graph.tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const sorted: Task[] = [];

  function visit(taskId: string): void {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const dep of task.dependsOn) {
        visit(dep);
      }
      sorted.push(task);
    }
  }

  for (const task of graph.tasks) {
    visit(task.id);
  }

  return ok(sorted);
}
