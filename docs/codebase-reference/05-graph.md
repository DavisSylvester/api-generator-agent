# src/graph/ -- Task Dependency Graph Engine

Manages the directed acyclic graph (DAG) of tasks, enabling parallel execution with dependency ordering.

---

## cycle-error.mts

**Exports:** `CycleError`

**What it does:** Custom error class storing the cycle as `readonly string[]`. Formats human-readable message like `"Cycle detected in task graph: A -> B -> A"`.

**Why it exists:** A cycle would cause infinite waiting. Typed error provides machine-readable cycle path for diagnostics.

---

## get-ready-tasks.mts

**Exports:** `getReadyTasks()`

**What it does:** Given a `TaskGraph` and sets of completed/running/failed task IDs, returns tasks eligible to execute. A task is ready when all dependencies are completed or failed (best-effort execution). **Exception:** If `setup-foundation` has failed, all dependents are blocked.

**Why it exists:** Enables parallel execution by computing which tasks have satisfied prerequisites.

---

## get-skipped-tasks.mts

**Exports:** `getSkippedTasks()`

**What it does:** Returns tasks that should be skipped because they depend on a failed `setup-foundation`. Excludes already-failed tasks.

**Why it exists:** Complements `getReadyTasks` -- explicitly marks blocked tasks so the executor records them and terminates correctly.

---

## parallel-executor.mts

**Exports:** `TaskProcessor` (type), `ExecutorConfig`, `executeGraph()`

**What it does:** Core concurrent task execution engine:
1. Pre-populates completed/failed sets from `preCompleted` (for resume).
2. Loops until all tasks are done.
3. Each iteration: marks skipped tasks, finds ready tasks, fills concurrency slots.
4. Uses `Promise.race` on in-flight tasks to wait for next completion.
5. Supports abort via `AbortSignal`.
6. Returns `Map<string, TaskState>` with every task's final state.

**Why it exists:** Maximizes throughput by running up to `maxConcurrency` tasks in parallel while respecting dependency ordering. Supports resuming interrupted runs.

---

## task-graph.mts

**Exports:** Re-exports `CycleError`, `validateGraph`, `getReadyTasks`, `getSkippedTasks`, `topologicalSort`

**What it does:** Barrel file consolidating all public graph utilities.

---

## topological-sort.mts

**Exports:** `topologicalSort()`

**What it does:** Returns `Result<readonly Task[], CycleError>`. Validates the graph then performs DFS topological sort producing a linear ordering respecting all dependencies.

**Why it exists:** Provides linear ordering for display, serial fallback execution, and acyclicity validation.

---

## validate-graph.mts

**Exports:** `validateGraph()`

**What it does:** Returns `Result<void, CycleError>`. Two checks:
1. **Missing dependencies:** Every referenced dependency ID must exist as a task.
2. **Cycle detection:** DFS with "in-stack" set to detect back edges.

**Why it exists:** Catches invalid graphs from the planning agent early with clear error messages.

---

## visualize.mts

**Exports:** `generateMermaid()`, `visualizeFromFile()`

**What it does:** Generates Mermaid diagram syntax from a `TaskGraph`. Adds START/END nodes, dependency edges, and styling. Can run as CLI tool.

**Why it exists:** Visual representation of task dependency graphs for debugging and documentation.
