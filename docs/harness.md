# The api-generator-agent Harness

This repo's "harness" is a multi-phase orchestrator that turns a PRD into a runnable Bun/Elysia API project. It is a directed pipeline with one self-correcting inner loop (the fix-loop), parallel task execution governed by a DAG, and a fallback escalation chain when a model can't get a task green.

It is **not** a Claude Code hook harness — `settings.json` hooks are unrelated. The harness is internal to this app: the orchestrator + per-task fix-loop.

---

## Top-level entry

`src/index.mts:140` — `main()` parses CLI flags, loads the PRD (file, stdin, or inline text), builds the DI container (`src/container/di.mts:94`), and either runs `--dry-run` (planning only) or hands off to `runPipeline()`.

CLI flags worth knowing:

- `--expand`, `--no-expand`, `--expand-only` — controls Phase 0 (PRD expansion)
- `--dry-run` — Phase 1 only, dumps the task graph
- `maxIterations` / `maxTasks` — positional overrides for fix-loop budget and graph trimming
- `--no-docs`, `--no-diagrams`, `--no-validate` — skip the corresponding late phases
- `--resume <runId>` — resume a previous run, skipping completed tasks

DI assembles every agent against an LLM provider (Ollama / OpenAI / Anthropic) and builds a list of `FallbackTier`s from any other API keys present (`src/container/di.mts:61`).

---

## The phases

`runPipeline()` in `src/orchestrator/pipeline.mts:66` is the single source of truth for phase ordering.

### Phase 0 — PRD expansion (optional)

`src/agents/prd-expansion-agent.mts:22` — `PrdExpansionAgent`.

- Triggered when input is raw inline text (auto), or when `--expand` / `--expand-only` is set.
- LLM call: `streamInvokeWithUsage` over `PRD_EXPANSION_SYSTEM_PROMPT` + the user input.
- Validates the response contains all `REQUIRED_SECTIONS`: `## Overview`, `## Stack`, `## Entities`, `## Endpoints`, `## Validation`, `## Non-Functional Requirements`.
- Strips wrapping fences if the LLM ignored the "no fences" instruction.
- Saves to `<workspace>/expanded-prds/expanded-<ts>.md`. In interactive mode the user is prompted to review/edit before continuing; `--expand-only` exits here.

### Phase 1 — Planning

`src/agents/planning-agent.mts:28` — `PlanningAgent`.

- Hashes the PRD (sha256), checks `.plan-cache/<hash>.json` first — caching means re-running the same PRD skips the LLM call.
- LLM call produces a JSON `TaskGraph`: array of `{ id, name, description, dependsOn, type, metadata }`. `type` is one of `setup | model | endpoint | middleware | service | repository`.
- Has JSON-repair fallback (control chars in strings, trailing commas) before failing.
- Validates with `planResponseSchema` (zod).
- Sanity check: warns if more than one root task or if the root isn't `setup-foundation`.
- DAG validated by `validateGraph()` (`src/graph/task-graph.mts`) — cycles fail the run.
- Plan written to `<run>/plan.json` and cached.

If `--dry-run` is set, the pipeline exits here after printing the task list.

### Phase 2 — Parallel task execution

The executor (`src/graph/parallel-executor.mts:14`) walks the DAG.

- Maintains `completed`, `failed`, `running` sets and an `inFlight` map.
- Each tick: marks transitively-skipped tasks (`getSkippedTasks` — any task whose dependency failed), computes `getReadyTasks` (deps done, not running/failed), fills slots up to `maxConcurrency`, then `Promise.race` until at least one finishes.
- Honors `signal: AbortSignal` for cooperative cancellation (remaining tasks become `skipped`).
- Pre-completed tasks (resume mode) are seeded into `results` before the first tick.

Per-task processing is delegated to either `runFixLoop` directly or — when `fallbackTiers` are configured — `runFallbackFixLoop`, which wraps the same inner loop.

### The fix-loop (the heart of the harness)

`src/orchestrator/fix-loop.mts:48` — `runFixLoop(task, runId, deps, config)`.

#### Setup (once per task)

- `Workspace.initTask(task.id)` creates `code/`, `code-linted/`, `tests/`, `integration/`, `iterations/` directories.
- Seeds `qa-knowledge.md` from `docs/knowledge-bases/<taskId>-knowledge.md` if present (curated lessons that prevent re-learning known failure modes).
- Gathers code from already-completed dependency tasks → `existingCodeContext` (full code on first iteration) and `existingCodeSummary` (paths + exports only, used during fix mode to keep prompt small).

#### Per-iteration, three steps (up to `config.maxIterations`)

**1. CodeGen** (`src/agents/codegen-agent.mts:38`)

- First iteration: `mode: 'generate'` with task description + dependency code.
- Subsequent iterations: `mode: 'fix'` with `previousCode`, `errors`, and accumulated QA knowledge.
- Parses fenced code blocks (` ```path/to/file.mts `), normalizes paths (collapses `src/src/`, `.ts` → `.mts`).
- Tier-1 retry: if no code blocks come back, retry the same model with `MUST_OUTPUT_CODE_BLOCKS` suffix.
- Records cost via `CostTracker`. If task cumulative cost > `taskCostLimit`, fails with `CostLimitExceededError`.
- Splits test files from code files BEFORE truncation; hard cap of `MAX_CODE_FILES_PER_TASK = 15` on code files (codegen "off the rails" guard).
- Writes everything to `tasks/<id>/iterations/<n>/code/` and a `prompt-iteration-<n>.md` audit doc.

**2. ESLint** (`src/agents/eslint-agent.mts:8`)

- Writes a minimal flat config to the task lint dir.
- Runs `bun eslint --fix` on each file. Failures are non-blocking — original content is kept.
- Then two static validators run in `fix-loop.mts:399-427`:
  - `validateImports` — every relative import path must resolve to a real file in the task's code or a dep file. Missing paths produce `wrong-path` / `missing-barrel` / `missing-file` errors that go straight back as the next iteration's `errors`. **QA is skipped that iteration.**
  - `validateNamedExports` — every named import must match an actual `export` in the target file. Skips QA if it fails.

**3. QA** (`src/agents/qa-agent.mts:44`)

- Ensures a Dockerized MongoDB on `localhost:27018` is running (singleton, reused across tasks). Cleaned up at end of pipeline.
- Copies shared output (completed deps) into the task's `code/` so test imports resolve.
- Installs third-party deps detected in the source (`installDependencies`).
- Deletes any stray `*.test.{mts,ts}` from `code/tests/` before running (otherwise paths resolve as `code/code/`).
- Phase 1: **Unit tests** — runs `bun test <file>` with `TEST_ENV_STUBS` injected (Auth0/AAD/Graph dummies) so module-load env reads don't TDZ-fail.
- Phase 2: **Integration tests** — skipped here (`testScope: 'unit-only'`); deferred to Phase 2.5.
- On failure: extracts knowledge entries via `analyzeTestErrors` and appends to `qa-knowledge.md`; the next codegen iteration sees them.

#### End-of-iteration outcomes

- **Pass** → write final code to `tasks/<id>/code/` and copy to shared `output/`. Empty-file recovery: if `foo.mts` is empty but `foo-source.mts` exists, copy the source file under the canonical name. Returns `completed`.
- **Fail** → build `lastErrors` (regression warnings + prefixed unit errors + raw test output, capped at 8000 chars) and `lastCode` (current code + tests). Loop continues.
- **Circuit breaker** (`fix-loop.mts:676`): if the error count doesn't decrease for `CIRCUIT_BREAKER_STALE_LIMIT = 5` consecutive iterations, break early. This prevents burning the rest of the budget on an unfixable state.
- **Regression detection**: tracks names of previously passing tests (`extractPassingTestNames`); any test that flips pass→fail injects a `REGRESSION:` prefix into the next prompt so codegen knows not to break what was already green.

#### Exhaustion

Loop ends without pass: writes best-effort code to both `code/` and `output/`, returns `failed`.

### Fallback fix-loop

`src/orchestrator/fallback-fix-loop.mts:45` — wraps `runFixLoop`.

1. Runs the primary fix-loop. If it returns `completed`, done.
2. Otherwise iterates `fallbackTiers` (typically GPT-5.4 then Claude Sonnet 4.6, configured in `src/container/di.mts:61`). For each tier: builds a `FixedModelCodegenAgent` that pins the codegen LLM to that tier's model, then runs `runFixLoop` again with `tier.maxIterations` (default 16) and the `MUST_OUTPUT_CODE_BLOCKS` suffix baked in.
3. All tiers exhausted → enters **diagnostic mode** (`src/orchestrator/diagnostic-fix.mts:54`): collects diagnoses from every available model with a `DIAGNOSTIC_SYSTEM_PROMPT`, runs `DIAGNOSTIC_ITERATIONS = 30` more attempts. If still no green, returns a `HARD FAILURE` state. The pipeline surfaces hard failures separately at the end.

### Phase 2.25 — Assembly

`pipeline.mts:709` — `assembleEntryFile`.

- Reads `setup-foundation/src/index.mts`.
- Scans every completed endpoint task's code dir for two patterns:
  - `export const fooRoutes = new Elysia(`
  - `export function createFooRoutes(): Elysia { ... }` (zero-arg, only in `routes/` dirs, name must contain `route`)
- Skips files in `middleware/` and `plugins/` (those are dependencies). Deduplicates by `path::exportName`.
- Inserts `import` lines after the last existing import and `.use(plugin)` / `.use(plugin())` calls before `.listen(`.
- Writes the assembled entry to `<run>/docs/assembled-index.mts`.

### Phase 2.3 — Project scaffolding

`src/orchestrator/scaffold-project.mts:7`.

- Scans `output/src/**` for third-party imports → builds `package.json`.
- Scans for `process.env.X` references → builds `.env.example`.
- Writes `tsconfig.json`, `.gitignore`.
- Copies `assembled-index.mts` over `output/src/index.mts` if present.
- Injects `@elysiajs/swagger` into `new Elysia()` so the output project always has `/swagger`.

### Phase 2.35 — DevContainer

`src/orchestrator/generate-devcontainer.mts` — generates a `.devcontainer/` folder so the output is immediately VS Code-ready. Failures are non-fatal (`logger.warn` and continue).

### Phase 2.5 — Integration tests

For each completed task with a Hoppscotch collection at `tasks/<id>/integration/collection.json`:

- Reads the task's code, calls `qaAgent.runIntegrationTests(...)` on a per-task port (`integrationPort + taskIndex`).
- Results land in `<run>/integration-results.json`.
- Tasks without a collection are skipped (logged, marked `passed: true` with a note).

### Phase 3 — Documentation

`src/agents/documentation-agent.mts:23` — `DocumentationAgent`.

- Concatenates all generated code (`gatherAllCode`).
- LLM produces a Hoppscotch collection JSON; basic structural validation (`v` and `name` keys present).
- Written to `<run>/docs/hoppscotch-collection.json`.
- Skippable via `--no-docs`.

### Phase 4 — Architecture diagrams

Spawns `diagram-generator-agent` (cloned from GitHub on demand to `.agents/diagram-generator-agent` and `bun install`-ed). Feeds it a synthesized system description (PRD summary + task list + tech stack). Output goes to `<run>/output/graphs`. Skippable via `--no-diagrams`. Failures are non-fatal.

### Phase 4.5 — Output validation

`src/orchestrator/validate-output.mts:14` — the proof-of-life gate.

- `bun install` in `output/`.
- Spawns `bun run src/index.mts` on a unique port (`integrationPort + tasks.length + 100`).
- Polls health, then loads `/swagger` headless (Playwright) and screenshots it.
- Records `installed`, `serverStarted`, `swaggerRendered`, `screenshotPath`, `errors`.
- Skippable via `--no-validate`.

This is the harness's answer to the global rule "a passing `bun test` is not sufficient" — the generated project must actually boot.

### Phase 5 — Reporting

- MongoDB container stopped (`QaAgent.stopMongoDB`).
- `SessionStore.generateHandoff` writes `SESSION-HANDOFF.md` for the next run.
- `generateReport` (`src/io/report-generator.mts`) builds `report.md` summarizing tasks, costs, durations, generated files, links to per-task activity logs.
- `notifier` sends `pipeline_complete` (Telegram + console channels in `src/notifications/`).
- Token usage written to `<run>/token-usage.json`; final pipeline result to `pipeline-result.json`.

---

## Cross-cutting machinery

- **State store:** `FeaturesStore` (`src/state/features-store.mts`) keeps a live `features.json` of in-progress / complete / failed task ids — survives crashes for resume.
- **Resume:** `--resume <runId>` (handled in CLI args + pipeline `isResume` branch). Loads completed task ids from each task's `status.json`, re-uses cached plan, skips completed tasks in the executor.
- **Observability:**
  - `ProgressReporter` — one per run, writes a live `<run>/.docs/progress.md` so a human can tail it.
  - `ActivityLog` — one per task, append-only markdown table at `<run>/.docs/tasks/<id>/activity.md`. Events: `task-start`, `iteration-start`, `codegen-start/end`, `eslint-start/end`, `qa-start/end`, `iteration-end`, `task-end`, `note`. Each event optionally links to its artifact JSON.
- **Cost ceiling:** `CostTracker` records every LLM call by model + task. The fix-loop fails the task if `taskCostLimit` is exceeded mid-iteration.
- **Token tracking:** `tokenTracker` (cumulative + history) flushed to `token-usage.json` at the end.
- **BaseAgent model fallback** (`src/agents/base-agent.mts:43`): independent from the fallback-fix-loop. Inside a single agent call, `modelChain.models` is tried in order until one returns ok or all fail. Timeout per call is 30 min default. This is the *first* line of model-failure defense; the fallback-fix-loop is the second.

---

## Workspace layout

Every run lives under `.workspace/<runId>/`:

```
config.json, plan.json, execution-summary.json, integration-results.json,
pipeline-result.json, token-usage.json, report.md, SESSION-HANDOFF.md,
features.json
logs/run.log
output/                       ← runnable Bun project (the deliverable)
docs/                         ← assembled-index.mts, hoppscotch-collection.json
.docs/                        ← progress.md, tasks/<id>/activity.md
tasks/<id>/
  code/, code-linted/, tests/, integration/
  status.json, qa-results.json, qa-knowledge.md
  iterations/<n>/code/, codegen-result.json, eslint-result.json,
                qa-result.json, errors.json, prompt-iteration-<n>.md
```

---

## Failure escalation summary (the "self-healing" path)

```
codegen attempt
  ├─ no code blocks? → retry once with MUST_OUTPUT_CODE_BLOCKS
  ├─ model errors out? → BaseAgent tries next model in modelChain
  └─ produces code
       │
       eslint (non-blocking)
       │
       static validators (imports + named exports)
         └─ fail → skip QA, errors fed straight back next iteration
       │
       QA
         ├─ pass → done
         └─ fail → append knowledge, regression-detect, build fix prompt
                    │
                    next iteration (up to maxFixIterations)
                    │
                    circuit breaker after 5 stale iterations
                    │
                    fallback tier 1 (gpt-5.4, 16 iter)
                    │
                    fallback tier 2 (claude-sonnet-4-6, 16 iter)
                    │
                    diagnostic mode (30 iter, multi-model voting)
                    │
                    HARD FAILURE → reported, pipeline continues for other tasks
```

---

## Design note: this is not a streaming agentic loop

A **streaming agentic loop** is the pattern Claude Code itself uses: the LLM is given tools, the loop streams tokens, the model decides "I'll call `Read`, then `Grep`, then `Edit`," tool results come back, the model decides what to do next — and that decide-and-act cycle continues until the model says it's done. The control flow lives *inside the LLM*. The harness around it is generic; what happens is whatever the model picked.

This app is the opposite. The control flow lives in `pipeline.mts` and `fix-loop.mts` — plain TypeScript:

```
if (codegenResult fails)        → retry / fallback / fail
if (importValidator fails)      → skip QA, loop
if (qa.passed)                  → return completed
else                            → build fix prompt, loop again
if (staleErrorCount >= 5)       → circuit-break
```

The LLM is called for narrow, structured jobs — "expand this PRD into 6 sections," "produce a JSON task graph," "generate code for this one task," "produce a Hoppscotch JSON." Each call is one-shot: send messages, get text back, parse it. The LLM never decides which phase runs next, never picks tools, never sees tool results from other agents. It's a procedural pipeline that *uses* an LLM the way a procedural program uses a parser.

So: streaming responses (tokens are streamed via `streamInvokeWithUsage` for UX), but not an agentic loop — agency lives in the orchestrator, not the model.

LangChain is used only for `BaseChatModel` invocation — despite the codebase referencing "LangGraph" historically, there is no graph runtime here. The DAG is a hand-rolled task executor (`src/graph/parallel-executor.mts`).
