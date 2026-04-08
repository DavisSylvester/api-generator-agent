import type { Task, TaskGraph } from '../types/task.mts';

export function getSkippedTasks(
  graph: TaskGraph,
  failed: ReadonlySet<string>,
): readonly Task[] {
  const skipped: Task[] = [];
  for (const task of graph.tasks) {
    if (failed.has(task.id)) continue;
    // Only skip tasks whose dependency on setup-foundation failed.
    // Other failed deps are allowed (best-effort execution).
    if (task.dependsOn.some((dep) => dep === `setup-foundation` && failed.has(dep))) {
      skipped.push(task);
    }
  }
  return skipped;
}
