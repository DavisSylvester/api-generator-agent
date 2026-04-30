# src/orchestrator/ -- Pipeline Orchestration

The orchestrator layer coordinates the entire API generation process through multiple phases and retry strategies.

---

## pipeline.mts

**Exports:** `PipelineDeps`, `runPipeline()`

**What it does:** Top-level orchestrator coordinating the full API generation lifecycle:

| Phase | Description |
|-------|-------------|
| **0 -- Workspace Setup** | Create new workspace or resume existing run |
| **1 -- Planning** | Check plan cache, call `PlanningAgent`, validate DAG, init `FeaturesStore` |
| **2 -- Task Execution** | Set up `ProgressReporter`, run `executeGraph()` with concurrency control |
| **2.25 -- Assembly** | Scan completed endpoint tasks, generate `assembled-index.mts` wiring all route plugins |
| **2.3 -- Scaffolding** | Call `scaffoldProject()` for package.json, tsconfig, README, etc. |
| **2.35 -- DevContainer** | Call `generateDevcontainer()` for Docker config |
| **2.5 -- Integration Testing** | Run Hoppscotch tests for completed tasks |
| **3 -- Documentation** | Call `DocumentationAgent` to generate Hoppscotch collection |
| **4 -- Diagrams** | Clone and run separate `diagram-generator-agent` |
| **4.5 -- Validation** | Call `validateOutput()` to verify everything works |
| **5 -- Reporting** | Generate run report, session handoff, token usage, final notification |

**Why it exists:** The master coordinator defining the complete lifecycle from PRD to deployable API.

---

## fix-loop.mts

**Exports:** `FixLoopConfig`, `FixLoopDeps`, `runFixLoop()`

**What it does:** The core Worker-Reviewer loop and heart of the system. For a single task, runs iterative generate-test-fix cycles:

**Each iteration (3 steps):**

1. **CodeGen (Step 1/3):** Calls `CodegenAgent` in `generate` or `fix` mode. If no code blocks returned, retries with stronger instruction. Separates test files from code. Guards against runaway codegen (max 15 files). Records cost and checks per-task limits. Writes prompt iteration logs.

2. **ESLint (Step 2/3):** Runs `EslintAgent` for auto-fixing. Also runs two pre-QA validators:
   - `validateImports()` -- checks all import paths resolve to actual files
   - `validateNamedExports()` -- verifies imported names exist in referenced files
   If validators find issues, iteration skips QA and feeds errors back to codegen.

3. **QA (Step 3/3):** Runs `QaAgent` in `runOnly`/`unit-only` mode. Copies shared dependency code into task directory. Extracts available exports.

**On success:** Writes final code to shared output, marks task completed.
**On failure:** Extracts errors, detects regressions, prepares for next iteration.
**Circuit breaker:** Breaks if errors don't decrease for 5 consecutive iterations.

Also includes helpers: `extractPassingTestNames()`, `buildDependencySummary()`, `gatherExistingCode()`.

**Why it exists:** Implements the iterative refinement strategy. A single code generation pass rarely produces perfect code -- this loop catches errors, feeds them back, and repeats until tests pass.

---

## fallback-fix-loop.mts

**Exports:** `FallbackFixLoopConfig`, `runFallbackFixLoop()`

**What it does:** Wraps `runFixLoop()` with multi-tier LLM escalation:

1. **Primary attempt:** Normal fix loop with primary model chain.
2. **Fallback tiers:** If primary fails, iterate through `FallbackTier[]` (each with specific model, max iterations, timeout). Creates `FixedModelCodegenAgent` pinned to that model.
3. **Diagnostic mode:** If all tiers exhausted, delegates to `runDiagnosticFix()`.
4. **Hard failure:** If diagnostic also fails, returns hard failure.

**Why it exists:** Maximizes task success probability by trying multiple models. Different LLMs have different strengths. Tries cheaper/faster models first.

---

## diagnostic-fix.mts

**Exports:** `DiagnosticResult`, `runDiagnosticFix()`

**What it does:** Last-resort escalation when all normal attempts fail:

1. **Diagnosis collection:** Sends task + errors to ALL available models in parallel for root-cause analysis ("wisdom of crowds").
2. **Diagnostic fix attempts:** For each fallback tier, creates a `FixedModelCodegenAgent`, injects diagnoses from all other models as context, runs fresh fix loop with 30 iterations.

If all diagnostic attempts fail, returns `HARD FAILURE` with `circuitBroken: true`.

**Why it exists:** Structured escalation for the hardest problems. Cross-model diagnosis maximizes the chance of solving stubborn tasks.

---

## scaffold-project.mts

**Exports:** `scaffoldProject()`

**What it does:** Transforms raw generated source files into a complete, runnable Bun project:
- Scans all source for third-party imports and env var references
- Generates `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `README.md`
- Copies assembled entry file to `src/index.mts`
- Injects Swagger if not already present

**Why it exists:** Generated code files alone aren't a runnable project. This adds all config and tooling needed for `bun install && bun run dev`.

---

## generate-devcontainer.mts

**Exports:** `generateDevcontainer()`

**What it does:** Generates VS Code DevContainer configuration:
- Detects stack (database type, runtime, port, env vars) by scanning source files
- Generates `devcontainer.json`, `docker-compose.yml`, `Dockerfile`, `.env`, `.env.example`, `.gitignore`

**Why it exists:** Zero-setup development experience. Open in VS Code and the DevContainer handles runtime, database, and all dependencies.

---

## validate-output.mts

**Exports:** `ValidationResult`, `validateOutput()`

**What it does:** End-to-end validation of the generated project:
1. Runs `bun install`
2. Launches `bun run src/index.mts`
3. Polls `GET /health` (up to 30s)
4. Verifies `/healthz` does NOT exist
5. Checks CORS headers
6. Uses Playwright to navigate to `/swagger`, takes screenshot

**Why it exists:** Final quality gate verifying the generated project works: deps install, server starts, health responds, Swagger renders.
