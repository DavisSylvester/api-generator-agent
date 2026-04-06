import type { Task, TaskGraph } from '../types/task.mts';

export function getSkippedTasks(
  graph: TaskGraph,
  failed: ReadonlySet<string>,
): readonly Task[] {
  const skipped: Task[] = [];
  for (const task of graph.tasks) {
    if (failed.has(task.id)) continue;
    if (task.dependsOn.some((dep) => failed.has(dep))) {
      skipped.push(task);
    }
  }
  return skipped;
}
