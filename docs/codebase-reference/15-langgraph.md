# src-langgraph/ -- Experimental LangGraph Pipeline

An alternative implementation of the pipeline using the LangGraph framework with state machine graphs and local Ollama models. Shares the same `templates/` directory with the production pipeline.

---

## Entry Points

### index.mts
**What it does:** CLI entry point with two modes:
- `visualize` -- outputs Mermaid diagrams of pipeline and task graphs
- `<prd-file> [max-iterations]` -- reads PRD and runs full pipeline

### serve-ui.mts
**What it does:** HTTP server on port 3333 serving a dark-themed dashboard. Fetches graph structures from LangGraph API (localhost:2024), renders as Mermaid diagrams.
**Why:** Visual debugging tool for graph topology.

---

## Config

### config/env.mts
**What it does:** Zod-validated env config: `OLLAMA_HOST`, `LANGSMITH_TRACING`, `MAX_FIX_ITERATIONS` (default 5), `MAX_CONCURRENCY` (default 4), `WORKSPACE_DIR`.

### config/models.mts
**What it does:** Model chains per role:
- Planning: qwen3.5:27b/35b (temp 0.3)
- Codegen: qwen3-coder:30b/devstral-small-2:24b (temp 0.2)
- Documentation: qwen3.5:27b/devstral/qwen3.5:35b (temp 0.1)
- QA: qwen3-coder:30b/devstral (temp 0.2)

---

## Graph Definitions

### graph/state.mts
**Exports:** `PipelineState`, `PipelineStateType`
**What it does:** LangGraph Annotation defining shared state: prdText, runId, taskGraph, currentTask, codeFiles, qaErrors, qaPassed, iteration, taskResults (append-only reducer), allGeneratedCode, hoppscotchCollection.

### graph/build-pipeline-graph.mts
**Exports:** `buildPipelineGraph()`
**What it does:** Top-level StateGraph: START -> plan -> (error: END, else: collect_code) -> docs -> END. Uses MemorySaver checkpointer.

### graph/build-task-graph.mts
**Exports:** `buildTaskGraph()`
**What it does:** Per-task fix-loop graph: START -> codegen -> eslint -> qa -> (passed/max: save_result -> END, else: loop to codegen).

### graph/visualize.mts
**Exports:** `visualizePipelineGraph()`, `visualizeTaskGraph()`
**What it does:** Compiles graphs and calls `drawMermaid()` for Mermaid output.

---

## LangGraph Studio Graphs

### graphs/pipeline.ts
**What it does:** Simplified pipeline graph for `langgraph.json` / LangGraph CLI. Stub nodes with same topology as build-pipeline-graph.

### graphs/task-loop.ts
**What it does:** Simplified task loop graph for LangGraph CLI. Stub nodes.

---

## Nodes (Individual Graph Steps)

### nodes/plan-node.mts
**What it does:** Sends PRD to planning model chain, parses JSON response, validates with Zod, produces `TaskGraph`.

### nodes/codegen-node.mts
**What it does:** Generate or fix code. Parses fenced code blocks from LLM response (regex for `.mts`/`.ts` paths). Supports generate and fix modes.

### nodes/eslint-node.mts
**What it does:** Writes files to temp dir, runs `bun eslint --fix`, reads back auto-fixed content.

### nodes/qa-node.mts
**What it does:** Sends code to QA model for test generation, parses tests, writes to workspace, runs `bun test`, extracts errors.

### nodes/collect-code-node.mts
**What it does:** Scans workspace for all `.mts` files across tasks, concatenates into `allGeneratedCode`.

### nodes/docs-node.mts
**What it does:** Sends all code to documentation model, expects Hoppscotch collection JSON.

### nodes/save-result-node.mts
**What it does:** Writes final code to workspace, creates `status.json`, resets task-specific state.

---

## LLM Layer

### llm/create-chat-model.mts
**Exports:** `invokeWithFallback()`, `LlmMessage`
**What it does:** Core LLM invocation with fallback. Iterates models in chain, creates `ChatOllama` per model, uses timeout wrapper. Returns `Result<{content, modelUsed}, Error>`.

### llm/thinking-spinner.mts
Same as production: ASCII spinner with rotating developer phrases.

### llm/with-timeout.mts
Same as production: promise timeout wrapper with `LlmTimeoutError`.

---

## Orchestrator

### orchestrator/run-pipeline.mts
**Exports:** `runPipeline()`
**What it does:** Three-phase orchestration:
1. **Planning:** Invoke pipeline graph for task graph generation
2. **Task Execution:** Process tasks in dependency order with concurrency control, run each through task fix-loop graph
3. **Documentation:** Invoke pipeline graph for Hoppscotch collection

---

## Types

### types/result.mts
Same `Result<T, E>` pattern as production.

### types/task.mts
Same `TaskType`, `TaskStatus`, `Task`, `TaskGraph`, `TaskResult`, `CodeFile` types.
