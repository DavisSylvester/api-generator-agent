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
    // A task is ready when all deps are either completed or failed (best-effort).
    // Exception: if setup-foundation failed, block all its dependents.
    return task.dependsOn.every((dep) => {
      if (failed.has(dep) && dep === `setup-foundation`) {
        return false;
      }
      return completed.has(dep) || failed.has(dep);
    });
  });
}
