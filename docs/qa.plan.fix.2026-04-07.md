# QA Pipeline Fix Plan — 2026-04-07

## Context

An Opus 4.6 audit of the pipeline source files found 3 critical, 10 medium, and 7 low issues. This plan fixes all critical and medium issues in one pass. The pipeline generates Elysia APIs via LLM (qwen3.5:27b) and runs QA with unit + integration tests.

---

## Critical Fixes

### 1. Fix parallel executor — true concurrency with `Promise.race`
**File:** `src/graph/parallel-executor.mts`

Current code uses `Promise.all(promises)` which waits for the entire batch before starting more tasks. Replace with a proper semaphore pattern: start tasks up to `maxConcurrency`, use `Promise.race` to detect when a slot frees up, then start the next ready task. Remove the dead `waitForAny` function.

### 2. Per-task port allocation for integration tests
**Files:** `src/orchestrator/pipeline.mts`, `src/orchestrator/fix-loop.mts`

Instead of passing a single `integrationPort` to all tasks, compute a unique port per task: `basePort + taskIndex`. Pass `taskIndex` into `runFixLoop` from the `executeGraph` callback. This guarantees no port collisions under concurrency.

### 3. Remove dead env mutation in index.mts
**File:** `src/index.mts` line 26

Delete the `(env as { MAX_FIX_ITERATIONS: number }).MAX_FIX_ITERATIONS = maxIterations;` line. The override already happens on line 48-50 via `effectiveConfig`.

---

## Medium Fixes

### 4. Tighten `extractErrors` in QA agent
**File:** `src/agents/qa-agent.mts` — `extractErrors()` function

Replace the overly broad substring matching with more precise patterns. Match `(fail)` as a prefix, `error:` with colon, `SyntaxError:`/`TypeError:`/`ReferenceError:` as specific error types, and `Cannot find` as a phrase. Remove bare `resolve`, `expected`, `Import`, `fail` matchers that cause false positives.

### 5. Don't overwrite package.json if it exists
**File:** `src/agents/qa-agent.mts` — `installDependencies()`

Check if `package.json` exists before writing a fresh one. If it exists, read it, merge new dependencies, then run `bun add` only for packages not already present. This avoids full reinstalls each iteration.

### 6. Make LANGSMITH_API_KEY optional
**File:** `src/config/env.mts`

Change `LANGSMITH_API_KEY: z.string().min(1)` to `LANGSMITH_API_KEY: z.string().default('')`. Gate tracing setup on whether the key is non-empty.

### 7. Preflight check — use health endpoint, not root
**File:** `src/agents/qa-agent.mts` — `preflightCheck()` and `waitForServer()`

Change both methods to try `/health` first, fall back to `/`. The codegen prompt requires a health endpoint, so `/health` is more reliable than root which may not be defined.

### 8. Write ESLint config to workspace
**File:** `src/agents/eslint-agent.mts`

Write a minimal `eslint.config.mjs` to `workDir` before running lint. This ensures consistent linting regardless of workspace location.

### 9. Per-run QA knowledge path
**File:** `src/io/workspace.mts`

Change `qaKnowledgePath()` from `join(this.baseDir, 'qa-knowledge.md')` to `join(this.root, 'qa-knowledge.md')` so each run has its own knowledge file. Prevents race conditions under concurrent runs.

### 10. Fix `let` to `const` in stream-invoke.mts
**File:** `src/llm/stream-invoke.mts` line 23

Change `let cleaned` to `const cleaned`.

### 11. Make `messages` parameter readonly in stream-invoke.mts
**File:** `src/llm/stream-invoke.mts` line 7

Change `messages: BaseMessage[]` to `messages: readonly BaseMessage[]`.

### 12. Fix phase numbering in pipeline logs
**File:** `src/orchestrator/pipeline.mts`

Align log messages with actual phase numbers: Phase 1 = Planning, Phase 2 = Execution, Phase 3 = Documentation.

---

## Files Modified

- `src/graph/parallel-executor.mts` — rewrite executor with Promise.race
- `src/orchestrator/pipeline.mts` — per-task port allocation, phase numbering
- `src/orchestrator/fix-loop.mts` — accept taskIndex for port offset
- `src/index.mts` — remove dead env mutation
- `src/agents/qa-agent.mts` — extractErrors, installDependencies, preflight
- `src/agents/eslint-agent.mts` — write eslint config to workspace
- `src/config/env.mts` — optional LANGSMITH_API_KEY
- `src/io/workspace.mts` — per-run knowledge path
- `src/llm/stream-invoke.mts` — const + readonly fixes
- `src/types/pipeline.mts` — may need integrationBasePort rename

## Verification

1. `bunx tsc --noEmit` — zero errors
2. `bun test tests/parse-test-file.test.mts` — existing tests pass
3. Run pipeline with concurrency 2: `bun run src/index.mts sample-prd.md 3 2` — verify different ports used per task in logs
4. Check no `LANGSMITH_API_KEY` required when env var is unset
5. Check workspace has per-run `qa-knowledge.md`

## Status

All 12 fixes implemented and verified on 2026-04-07. Type-check clean, 21/21 tests pass.
