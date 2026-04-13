# Architecture Overview

## High-Level Architecture

agent-one is structured in layers that process input through planning, generation, verification, and output:

```
+------------------------------------------------------------------+
|                        agent-one                                  |
|                                                                   |
|  Entry Points                                                     |
|  +------------------+    +------------------+                     |
|  | CLI (index.mts)  |    | Agent Bridge     |                     |
|  |                  |    | (agent-bridge)   |                     |
|  +--------+---------+    +--------+---------+                     |
|           |                       |                               |
|           +-------+-------+-------+                               |
|                   |                                               |
|  Shared Orchestrator (cli/run-orchestrator.mts)                   |
|                   |                                               |
|  +----------------v-----------------+                             |
|  | Input Layer                      |                             |
|  |  - prompt-parser (NL -> specs)   |                             |
|  |  - prd-parser (MD -> specs)      |                             |
|  |  - prd-interviewer (interactive) |                             |
|  +----------------+-----------------+                             |
|                   |                                               |
|  +----------------v-----------------+                             |
|  | Planning Layer                   |                             |
|  |  - feature-extractor             |                             |
|  |  - dependency-resolver           |                             |
|  |  - generation-planner            |                             |
|  +----------------+-----------------+                             |
|                   |                                               |
|  +----------------v-----------------+                             |
|  | Orchestrator (pipeline.mts)      |                             |
|  |  - LLM-driven fix loop          |                             |
|  |  - Parallel task execution       |                             |
|  |  - Fallback tier escalation      |                             |
|  +----------------+-----------------+                             |
|                   |                                               |
|  +-------+--------+--------+--------+--------+                   |
|  |       |        |        |        |        |                   |
|  v       v        v        v        v        v                   |
| Gen    Verify   State    Trace    Git     Output                 |
| Engine Pipeline  Mgmt    Logger   Ops     Writer                 |
+------------------------------------------------------------------+
```

---

## Module Map

### Entry Points

| Module | File | Purpose |
|--------|------|---------|
| CLI | `src/index.mts` | Command-line interface with generate/resume/status/trace commands |
| Agent Bridge | `src/agent-bridge.mts` | Claude Code custom agent entry point |

Both entry points delegate to the shared orchestrator.

### Shared Orchestrator

| Module | File | Purpose |
|--------|------|---------|
| Arg Parser | `src/cli/parse-args.mts` | CLI argument parser with flag and legacy positional support |
| Prompt | `src/cli/prompt.mts` | Interactive yes/no and choice prompts for human-in-the-loop |
| Run Orchestrator | `src/cli/run-orchestrator.mts` | Shared logic for parsing input, planning, status, and resume |

### Input Layer (`src/input/`)

| Module | File | Purpose |
|--------|------|---------|
| Prompt Parser | `prompt-parser.mts` | Parse natural language prompts into feature specs |
| PRD Parser | `prd-parser.mts` | Parse markdown PRDs with checkboxes into feature specs |
| PRD Interviewer | `prd-interviewer.mts` | Interactive PRD generation through question flow |

### Planning Layer (`src/planning/`)

| Module | File | Purpose |
|--------|------|---------|
| Feature Extractor | `feature-extractor.mts` | Normalize features, infer relationships, deduplicate |
| Dependency Resolver | `dependency-resolver.mts` | Topological sort with cycle detection (Kahn's algorithm) |
| Generation Planner | `generation-planner.mts` | Create ordered generation plan with step dependencies |

### Orchestrator (`src/orchestrator/`)

| Module | File | Purpose |
|--------|------|---------|
| Pipeline | `pipeline.mts` | Main pipeline: plan -> execute -> assembly -> scaffold -> devcontainer -> tests -> docs -> validate |
| Fix Loop | `fix-loop.mts` | Code generation + LLM-driven fix loop per task |
| Fallback Fix Loop | `fallback-fix-loop.mts` | Multi-tier LLM fallback (Ollama -> OpenAI -> Claude) |
| Scaffold Project | `scaffold-project.mts` | Generates package.json, tsconfig, .gitignore, README for output |
| DevContainer | `generate-devcontainer.mts` | Generates .devcontainer/ with Docker Compose, Dockerfile, .env |
| Validate Output | `validate-output.mts` | Installs deps, starts server, Playwright Swagger screenshot |

### Generation Engine (`src/generation/`)

| Module | File | Purpose |
|--------|------|---------|
| Engine | `engine.mts` | Orchestrates template rendering per feature |
| Template Registry | `template-registry.mts` | Discovers and manages templates (base + addons) |

### Templates (`templates/`)

| Directory | Purpose |
|-----------|---------|
| `templates/base/` | 19 CRUD base templates (.tmpl.mts files) |
| `templates/addons/` | Addon templates (Phase 4, managed separately) |

### Verification (`src/verification/`)

| Module | File | Purpose |
|--------|------|---------|
| Pipeline | `pipeline.mts` | Runs 4 gates in sequence with retry logic |
| ESLint Gate | `eslint-gate.mts` | Programmatic ESLint check with auto-fix |
| Test Gate | `test-gate.mts` | Run bun test, parse results |
| Smoke Gate | `smoke-gate.mts` | Start server, hit endpoints, validate responses |
| Playwright Gate | `playwright-gate.mts` | Navigate to /swagger, take screenshot |

### State Management (`src/state/`)

| Module | File | Purpose |
|--------|------|---------|
| Features Store | `features-store.mts` | Read/write features.json (pending/in-progress/complete/failed) |
| PRD Store | `prd-store.mts` | Update PRD checkboxes as features complete |
| Session Store | `session-store.mts` | Generate session handoff documents |

### Trace & Observability (`src/trace/`)

| Module | File | Purpose |
|--------|------|---------|
| Trace Logger | `trace-logger.mts` | Per-step trace capture with ULID trace IDs |
| Trace Writer FS | `trace-writer-fs.mts` | Write traces as markdown to .docs/ |
| Trace Writer Mongo | `trace-writer-mongo.mts` | Write traces to MongoDB collection |
| Session Summary | `session-summary.mts` | Aggregate traces into end-of-session report |

### Git Operations (`src/git/`)

| Module | File | Purpose |
|--------|------|---------|
| Git Ops | `git-ops.mts` | Init, commit, commitFeature, checkpoint, rollback |

### Output (`src/output/`)

| Module | File | Purpose |
|--------|------|---------|
| File Writer | `file-writer.mts` | Write generated files to disk |
| Console Reporter | `console-reporter.mts` | Progress and status output |

### Core Types (`src/core/`)

| Module | File | Purpose |
|--------|------|---------|
| IFeatureSpec | `interfaces/i-feature-spec.mts` | Feature, entity, field, relationship specs |
| IGenerationPlan | `interfaces/i-generation-plan.mts` | Plan with ordered steps |
| ITemplate | `interfaces/i-template.mts` | Template contract |
| ITraceEntry | `interfaces/i-trace-entry.mts` | Trace entry with tool uses, tokens, errors |
| IVerificationResult | `interfaces/i-verification-result.mts` | Gate pass/fail with details |
| IReviewGate | `interfaces/i-review-gate.mts` | Human review checkpoint interface |
| AutoApproveReviewGate | `interfaces/i-review-gate-auto.mts` | Auto-approve for CI/batch mode |
| CallbackReviewGate | `interfaces/i-review-gate-callback.mts` | Callback-based for CLI and agent mode |

---

## Data Flow

### Generate Command Flow

```
User Input (PRD or prompt)
  |
  v
[arg-parser] Parse CLI args
  |
  v
[run-orchestrator] parseInput() -> IFeatureSpec[]
  |
  v
[run-orchestrator] runPlanning()
  |
  +-> [feature-extractor] normalize, infer relationships, deduplicate
  +-> [dependency-resolver] topological sort (Kahn's algorithm)
  +-> [generation-planner] create IGenerationPlan with ordered steps
  |
  v
[--dry-run?] If yes: formatPlan() and exit
  |
  v
[pipeline] runPipeline()
  |
  +-> [planning-agent] LLM generates task graph from PRD
  +-> [graph/parallel-executor] Execute tasks respecting dependencies
  |     |
  |     +-> Per task: [fix-loop] codegen + eslint + QA in retry loop
  |     |     |
  |     |     +-> [codegen-agent] LLM generates code
  |     |     +-> [eslint-agent] Lint and auto-fix
  |     |     +-> [qa-agent] Generate and run tests
  |     |     +-> Retry up to maxIterations
  |     |
  |     +-> [features-store] Update status per feature
  |
  +-> [assembly] Wire endpoint plugins into entry file
  +-> [scaffold-project] Generate package.json, tsconfig, README
  +-> [generate-devcontainer] Generate .devcontainer/, .env
  +-> [qa-agent] Integration tests against Docker MongoDB
  +-> [documentation-agent] Generate API docs
  +-> [validate-output] Install deps, start server, Playwright screenshot
  +-> [session-store] Write handoff document
  +-> [post-success] Optional UI and IaC generation (AWS CDK / Terraform)
```

### Resume Command Flow

```
Run ID
  |
  v
[run-orchestrator] getRunStatus() -> read features.json
  |
  v
[run-orchestrator] getResumableFeatures() -> pending/in-progress features
  |
  v
[pipeline] runPipeline() with original plan
  |
  v
(same execution flow as generate, skipping completed features)
```

---

## Key Design Decisions

### Shared orchestrator pattern

Both CLI and agent bridge share the same core modules through `src/cli/run-orchestrator.mts`. This module exports pure functions that accept a Logger and return results, making them testable and adapter-agnostic.

### Review gate abstraction

The `IReviewGate` interface allows different review mechanisms:
- `AutoApproveReviewGate` for CI/batch mode
- `CallbackReviewGate` for CLI prompts and Claude Code pauses

### Result type pattern

All fallible operations return `Result<T, E>` (discriminated union) instead of throwing. This makes error handling explicit and composable.

### Template literals over template engines

Templates are raw TypeScript functions returning strings. This provides:
- Full type safety and IDE support
- No extra build step or runtime dependency
- Composable template fragments

### Features.json as source of truth

The `features.json` file tracks the state of every feature across sessions. It enables:
- Resume after interruption
- Status reporting
- Rollback to last good state

### LLM fallback tiers

The pipeline supports multiple LLM backends with automatic fallback:
1. Local Ollama (default)
2. OpenAI GPT (if OPENAI_API_KEY is set)
3. Anthropic Claude (if ANTHROPIC_API_KEY is set)
