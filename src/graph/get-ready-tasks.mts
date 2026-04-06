import type { Task, TaskGraph } from '../types/task.mts';

export function getReadyTasks(
  graph: TaskGraph,
  completed: ReadonlySet<string>,
  running: ReadonlySet<string>,
  failed: ReadonlySet<string>,
): readonly Task[] {
  return graph.tasks.filter((task) => {
    if (completed.has(task.id) || running.has(task.id) || failed.has(task.id)) {
      return false;
    }
    return task.dependsOn.every((dep) => completed.has(dep));
  });
}
