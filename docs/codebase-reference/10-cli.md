# src/cli/ -- Command Line Interface

---

## index.mts (src/cli/)

**Exports:** Re-exports from `arg-parser.mts` and `run-orchestrator.mts`

**What it does:** Barrel file consolidating all CLI exports.

---

## arg-parser.mts

**Exports:** `CLI_COMMANDS`, `CliCommand`, `ParsedGenerateArgs`, `ParsedResumeArgs`, `ParsedStatusArgs`, `ParsedTraceArgs`, `ParsedArgs`, `ParseError`, `ParseResult`, `parseArgs()`, `getHelpText()`

**What it does:** Zero-dependency CLI argument parser for the "agent-one" identity. Parses `process.argv` into typed command structures for four commands: `generate`, `resume`, `status`, `trace`. Supports `--prd`, `--prompt`, `--dry-run`, `--max-iterations`, `--output` flags. Returns a `Result`-style discriminated union.

**Why it exists:** Structured, testable argument parsing separate from business logic. This is the original CLI parser; the current entry point (`src/index.mts`) uses `parse-args.mts` instead.

---

## parse-args.mts

**Exports:** `CliFlags`, `parseCliFlags()`

**What it does:** The current CLI flag parser used by `src/index.mts`. Parses flags including `--prd`, `--resume`, `--prompt`, `--iterations`, `--max-tasks`, `--concurrency`, `--output`, `--list-runs`, `--status`, `--diagrams`/`--no-diagrams`, `--ui`/`--no-ui`, `--iac`/`--no-iac`, `--help`.

**Why it exists:** Replaced the older `arg-parser.mts` with a more comprehensive flag set matching the current pipeline features.

---

## prompt.mts

**Exports:** `promptForPrd()`

**What it does:** Interactive terminal prompt that asks the user for a PRD or short description when no `--prd` flag is provided.

**Why it exists:** Fallback input method when the user doesn't provide a PRD file.

---

## run-orchestrator.mts

**Exports:** `OrchestratorInput`, `OrchestratorConfig`, `GenerationPlanResult`, `RunSummary`, `RunStatus`, `parseInput()`, `runPlanning()`, `formatPlan()`, `getRunStatus()`, `formatRunStatus()`, `getResumableFeatures()`

**What it does:** Bridges the CLI layer and the generation engine. `parseInput()` reads PRD files or prompts. `runPlanning()` invokes the feature extractor and generation planner. `formatPlan()` renders plans as tables. `getRunStatus()` reads workspace state. `getResumableFeatures()` lists incomplete features for resume mode.

**Why it exists:** Decouples CLI argument handling from orchestration logic. Part of the original "agent-one" CLI workflow.

---

## list-runs.mts

**Exports:** `listRuns()`

**What it does:** Scans the `.workspace/` directory for previous runs. For each, reads `config.json` and `execution-summary.json` to display run ID, date, PRD, task pass/fail counts, and duration.

**Why it exists:** Implements the `--list-runs` CLI flag for viewing pipeline run history.

---

## show-status.mts

**Exports:** `showStatus()`

**What it does:** Reads workspace state for a specific run ID and displays task-by-task status with pass/fail/skip counts and iteration details.

**Why it exists:** Implements the `--status <runId>` CLI flag for inspecting a specific run.

---

## src/index.mts (Main Entry Point)

**Exports:** None (entry point)

**What it does:** The primary entry point for the entire application:
1. Parses CLI flags via `parseCliFlags()`
2. Handles `--help`, `--list-runs`, `--status` commands
3. Loads `.env` and validates via `loadEnv()`
4. Runs preflight LLM check
5. Creates DI container via `createContainer()`
6. Reads PRD from file, prompt, or interactive input
7. Optionally expands short prompts via `PrdExpansionAgent`
8. Invokes `runPipeline()` with config and dependencies
9. Handles post-pipeline operations:
   - Flutter UI generation (`--ui`)
   - IaC generation (`--iac`)
   - Output directory copying (`--output`)
10. Manages graceful shutdown via "stop" command listener
11. Displays final results and exit code

**Why it exists:** The executable entry point that ties CLI, configuration, DI, and pipeline together.

---

## src/agent-bridge.mts

**Exports:** `AgentBridgeOptions`, `runFromAgentBridge()`

**What it does:** Alternative entry point for invoking the pipeline from another agent (e.g., Claude Code). Accepts structured options instead of CLI args. Skips interactive prompts and terminal UI.

**Why it exists:** Enables programmatic invocation of the pipeline from parent agents or automation scripts.
