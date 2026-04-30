# Remaining src/ Modules

---

## src/git/ -- Git Operations

### git-ops.mts
**Exports:** `GitOps`
**What it does:** Manages git operations for the generated project: `init()` creates a new repo, `commit()` stages and commits with a message. Uses `Bun.spawn` to execute git commands.
**Why it exists:** Optionally initializes a git repo in the generated output directory.

### index.mts
Barrel file.

---

## src/input/ -- Input Parsing

### prd-parser.mts
**Exports:** `parsePrd()`
**What it does:** Parses a PRD markdown file into structured `IFeatureSpec[]`. Extracts project name from heading, parses checkbox-style feature lists, detects entity specs, tracks completion status.
**Why it exists:** Converts human-written PRDs into machine-readable feature specs for the template-based engine.

### prd-interviewer.mts
**Exports:** `PrdInterviewer`
**What it does:** Multi-turn LLM conversation that interviews the user to generate a complete PRD. Asks clarifying questions about entities, relationships, endpoints.
**Why it exists:** Alternative to writing a PRD file -- interactive PRD generation.

### prompt-parser.mts
**Exports:** `parsePrompt()`
**What it does:** Parses a natural language prompt into `IFeatureSpec[]`. Extracts entity names, infers CRUD operations, generates field specs.
**Why it exists:** Quick path from a one-liner to feature specs without a full PRD.

### index.mts
Barrel file.

---

## src/interfaces/ -- Shared Interfaces

### i-llm-factory.mts
**Exports:** `ILlmFactory`
**What it does:** Interface for LLM model creation: `create(model, temperature)`, `createWithThinking(model, temperature)`.
**Why it exists:** Abstraction enabling provider-agnostic agent code.

---

## src/notifications/ -- Notification System

### notifier.mts
**Exports:** `NotificationChannel`, `NotificationEvent`, `Notifier`
**What it does:** Dispatches pipeline events to registered channels. Events: `task_started`, `task_passed`, `task_failed`, `hard_failure`, `pipeline_complete`. Supports interval-based throttling.
**Why it exists:** Keeps users informed of pipeline progress, especially for background runs.

### console-channel.mts
**Exports:** `ConsoleChannel`
**What it does:** Implements `NotificationChannel` for terminal output. Formats events with colors and emojis.
**Why it exists:** Always-on notification channel.

### telegram-channel.mts
**Exports:** `TelegramChannel`
**What it does:** Implements `NotificationChannel` for Telegram messages. Sends formatted messages via Telegram Bot API.
**Why it exists:** Remote monitoring for long-running pipeline runs.

---

## src/output/ -- Output Writing

### file-writer.mts
**Exports:** `FileWriter`
**What it does:** Writes generated files to the output directory, creating parent directories as needed. Returns `Result<void, Error>`.

### console-reporter.mts
**Exports:** `ConsoleReporter`
**What it does:** Formats and prints generation results to the terminal with colors and tables.

### index.mts
Barrel file.

---

## src/planning/ -- Generation Planning

### feature-extractor.mts
**Exports:** `extractFeatures()`
**What it does:** Infers features from parsed input: entity names, relationships, implied CRUD endpoints. Deduplicates features.
**Why it exists:** Bridges raw parsing output to the generation planner.

### dependency-resolver.mts
**Exports:** `resolveDependencies()`
**What it does:** Topological sort of features by dependency. Detects cycles.
**Why it exists:** Ensures features are generated in correct order.

### generation-planner.mts
**Exports:** `GenerationPlanner`
**What it does:** Creates a `IGenerationPlan` from features: maps each entity to file targets for all template types (interface, schema, repo, service, router, test).
**Why it exists:** Translates features into a concrete file generation plan.

### index.mts
Barrel file.

---

## src/state/ -- State Management

### features-store.mts
**Exports:** `FeaturesStore`
**What it does:** Tracks feature generation status in a `features.json` file. Methods: `init()`, `markInProgress()`, `markComplete()`, `markFailed()`, `getAll()`, `getByStatus()`.
**Why it exists:** Persistent state for resume support and progress tracking.

### prd-store.mts
**Exports:** `PrdStore`
**What it does:** Persists parsed PRD data: `save()`, `load()`, `list()`, `updateCheckedFeatures()`.
**Why it exists:** Stores parsed PRDs for reuse and tracking.

### session-store.mts
**Exports:** `SessionStore`
**What it does:** Generates `SESSION-HANDOFF.md` -- a markdown document summarizing the run with task table, failed tasks, file output. For handing off results to the user.
**Why it exists:** Produces a human-readable summary at pipeline end.

### index.mts
Barrel file.

---

## src/trace/ -- Observability and Tracing

### trace-logger.mts
**Exports:** `TraceLogger`
**What it does:** Records trace entries (step, entity, status, duration, metadata) during generation. Produces a session summary.
**Why it exists:** Detailed audit log of every generation step.

### session-summary.mts
**Exports:** `buildSessionSummary()`, `renderSessionSummaryMarkdown()`
**What it does:** Aggregates trace entries into a summary (total duration, pass/fail counts, per-entity stats). Renders as markdown.
**Why it exists:** Post-run analysis.

### trace-writer-fs.mts
**Exports:** `TraceWriterFs`
**What it does:** Writes trace entries as JSON files to disk.

### trace-writer-mongo.mts
**Exports:** `TraceWriterMongo`
**What it does:** Writes trace entries to MongoDB (alternative to filesystem).

### index.mts
Barrel file.

---

## src/types/ -- Shared Type Definitions

### task.mts
**Exports:** `TaskType`, `TaskStatus`, `Task`, `TaskGraph`, `TaskState`, `CodeFile`
**What it does:** Core domain types for the task execution system.

### pipeline.mts
**Exports:** `PipelineConfig`, `PipelineResult`
**What it does:** Configuration and result types for the pipeline.

### result.mts
**Exports:** `Result<T, E>`, `Ok<T>`, `Err<E>`, `ok()`, `err()`
**What it does:** Discriminated union Result type with runtime constructors.

### ok.mts / err.mts
**Exports:** `ok()` / `err()`
**What it does:** Standalone constructor functions.

### agent-context.mts
**Exports:** `AgentContext`
**What it does:** Context passed to agents (run ID, task ID, iteration).

### llm-errors.mts
**Exports:** `LlmErrorClass`, `classifyLlmError()`, `CostLimitExceededError`
**What it does:** Classifies LLM errors as retryable/non-retryable. Error classes: `rate_limit`, `auth`, `invalid_request`, `server`, `timeout`, `network`, `unknown`.

### index.mts
Barrel file.

---

## src/validators/ -- Code Validators

### import-validator.mts
**Exports:** `validateImports()`
**What it does:** Checks that all import paths in generated code resolve to actual files. Suggests corrections for wrong paths.
**Why it exists:** Pre-QA validation that catches import errors before running tests.

### extract-exports.mts
**Exports:** `extractExports()`
**What it does:** Parses TypeScript files to extract named exports (functions, classes, constants, interfaces). Verifies imported names exist.
**Why it exists:** Catches phantom imports that would fail at runtime.

---

## src/verification/ -- Verification Gates

### eslint-gate.mts
**Exports:** `EslintGate`
**What it does:** Runs ESLint on generated code and reports violations as `IVerificationResult`.

### test-gate.mts
**Exports:** `TestGate`
**What it does:** Runs `bun test` on generated tests and reports pass/fail as `IVerificationResult`.

### smoke-gate.mts
**Exports:** `SmokeGate`
**What it does:** Starts the generated server, checks `/health` endpoint responds.

### playwright-gate.mts
**Exports:** `PlaywrightGate`
**What it does:** Uses Playwright to verify Swagger UI renders and take screenshots.

### pipeline.mts (verification)
**Exports:** `VerificationPipeline`
**What it does:** Orchestrates all gates in sequence: ESLint -> Tests -> Smoke -> Playwright.

### index.mts
Barrel file.
