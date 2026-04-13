# API Generator Agent

Autonomous pipeline that takes a PRD (Product Requirements Document) and generates a complete Elysia + BunJS API with models, repositories, services, middleware, endpoints, and tests. Uses LLMs to generate code, validates with ESLint, runs real tests against MongoDB Docker, and self-corrects through a multi-tier fix loop.

## Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Docker](https://www.docker.com/) (for MongoDB test containers)
- [Node.js](https://nodejs.org/) (for Playwright validation step)
- An LLM provider — at least one of:
  - **Ollama** (local, free) — install from [ollama.com](https://ollama.com), run `ollama serve`
  - **OpenAI** — set `OPENAI_API_KEY` in `.env`
  - **Anthropic** — set `ANTHROPIC_API_KEY` in `.env`

The pipeline verifies your LLM provider is reachable at startup and exits with a clear error if not.

## Quick Start

```bash
# Install dependencies
bun install

# Configure your LLM provider (pick one)
echo 'LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...' > .env

# Generate an API into ./my-api
./run.sh --prd sample-prds/todo-api.md --output ./my-api

# Windows
run.cmd --prd sample-prds/todo-api.md --output ./my-api
```

---

## Sample PRDs

The [`sample-prds/`](sample-prds/) directory contains example PRDs you can use to test the pipeline:

| PRD | Complexity | Description |
|-----|------------|-------------|
| [Todo API](sample-prds/todo-api.md) | Simple | CRUD todos with user auth and pagination. Good starting point. |
| [Bookmark Manager](sample-prds/bookmark-manager.md) | Medium | Bookmarks with nested folders, tags, and search. |
| [Beautician Scheduling](sample-prds/beautician-scheduling.md) | Medium | Multi-tenant appointment scheduling with availability slots, grace periods, and discount codes. |
| [BJJ Open Mat Finder](sample-prds/bjj-open-mat-finder.md) | Complex | Geospatial gym search, Auth0 integration, Google Places validation, check-ins, and reviews. |

```bash
# Try the simplest one first
./run.sh --prd sample-prds/todo-api.md

# Or go big
./run.sh --prd sample-prds/bjj-open-mat-finder.md --iterations 20
```

---

## CLI Reference

```
Usage:
  bun run src/index.mts --prd <file> [options]
  bun run src/index.mts --resume <run-id> [options]
  bun run src/index.mts --list-runs
  bun run src/index.mts --status <run-id>

Options:
  -p, --prd <file>       Path to PRD markdown file (required for new runs)
  -r, --resume <run-id>  Resume a previous run (skips completed tasks)
  -i, --iterations <n>   Max fix loop iterations per task (default: from env or 5)
  -t, --max-tasks <n>    Max tasks to execute (default: all)
  -c, --concurrency <n>  Max parallel tasks (default: from env)
  -o, --output <dir>     Copy generated project to this directory on success
  -d, --diagrams         Generate diagrams (no prompt)
  -D, --no-diagrams      Skip diagram generation (no prompt)
  -N, --no-docs          Skip documentation generation phase
  -V, --no-validate      Skip output validation (bun install, swagger screenshot)
      --ui               Generate UI after successful run (no prompt)
      --no-ui            Skip UI generation (no prompt)
      --iac <provider>   Generate IaC after success: "cdk" or "terraform" (no prompt)
      --no-iac           Skip IaC generation (no prompt)
  -l, --list-runs        List all previous runs with status
  -s, --status <run-id>  Show detailed status of a specific run
  -h, --help             Show help message

When --diagrams/--no-diagrams, --ui/--no-ui, or --iac/--no-iac are omitted
the pipeline will prompt you interactively.
```

Legacy positional args are still supported for backward compatibility:

```bash
bun run src/index.mts <prd-file> [max-iterations] [max-tasks]
```

---

## Examples

### Start a new run

```bash
# Generate into ./my-api — prompts for diagrams, UI, and IaC interactively
./run.sh --prd sample-prds/todo-api.md --output ./my-api

# Skip all prompts: diagrams yes, no UI, Terraform IaC
./run.sh --prd sample-prds/todo-api.md -o ./my-api --diagrams --no-ui --iac terraform

# Skip all prompts: no diagrams, no UI, AWS CDK
./run.sh --prd sample-prds/beautician-scheduling.md -o ./salon-api --no-diagrams --no-ui --iac cdk

# Development mode (output stays in .workspace/)
./run.sh --prd sample-prds/todo-api.md --iterations 20 --no-diagrams --no-ui --no-iac

# Limit to first 5 tasks only (useful for testing)
./run.sh --prd sample-prds/todo-api.md --iterations 10 --max-tasks 5
```

### Check run status

```bash
# List all runs
bun run src/index.mts --list-runs
```

```
  Run ID                                 | Started              | Status          | Tasks
  ----------------------------------------|----------------------|-----------------|--------------------
  147e1d75-8fd1-4086-b9c3-d0c1f8d2e204   | 2026-04-12 01:55:33  | in progress     | 15/23 passed
  6b8ed261-b6fe-42bb-beeb-414a8706b5a2   | 2026-04-11 23:58:06  | 10989s          | 23/23 passed
  14bee6f2-c39d-4796-a5fe-878d422d429e   | 2026-04-11 21:14:44  | 6668s           | 29/29 passed
```

```bash
# Detailed task-by-task status for a specific run
bun run src/index.mts --status 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204
```

```
  === Run: 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204 ===

  Started:      2026-04-12T01:55:33.749Z
  Iterations:   20
  Concurrency:  1
  Tokens:       937,810 total

  Tasks (23 total):

    Status  | Iter | Task ID                          | Name
    --------|------|----------------------------------|------------------------------
    OK     | 1    | setup-foundation                 | Project Foundation & Core Config
    OK     | 1    | model-core-types                 | Core Type Definitions
    OK     | 3    | model-input-schemas              | Input & Validation Schemas
    ...
    OK     | 1    | service-favorite                 | Favorite Service
    PEND   | -    | middleware-auth                  | Auth Middleware
    PEND   | -    | endpoint-auth                    | Auth Endpoints
    ...

  In progress: 15 completed, 0 failed, 8 pending
  Resume with: bun run src/index.mts --resume 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204
```

### Resume an interrupted run

If a pipeline is interrupted (process killed, timeout, crash), resume it to skip already-completed tasks:

```bash
# Resume picks up where it left off -- completed tasks are skipped
./run.sh --resume 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204

# Resume with different iteration count
./run.sh --resume 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204 --iterations 15

# Windows
run.cmd --resume 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204
```

The resume feature:
- Loads the existing plan from the previous run (no re-planning)
- Scans `tasks/{taskId}/status.json` to find completed tasks
- Skips completed tasks and only runs pending/failed ones
- Appends to the existing run log

### Run in the background

For long-running pipelines, use the background launchers. Telegram notifications report progress every 5 minutes.

**Linux / Mac / Git Bash:**

```bash
./run-bg.sh --prd bjj-open-mat-prd.md --iterations 20
```

```
=== api-generator-agent ===
Starting pipeline in background...
Log:      .workspace/run-20260412-031500.log
Telegram: updates every 5 min

PID:      12345

Commands:
  Follow:  tail -f .workspace/run-20260412-031500.log
  Status:  bun run src/index.mts --list-runs
  Stop:    kill 12345

Pipeline is running. You can close this terminal.
```

**Windows:**

```cmd
run-bg.cmd --prd bjj-open-mat-prd.md --iterations 20
```

**Resume in the background:**

```bash
./run-bg.sh --resume 147e1d75-8fd1-4086-b9c3-d0c1f8d2e204
```

### Generate diagrams separately

```bash
# Linux / Mac / Git Bash
./run-diagrams.sh input-description.md output-dir/

# Windows
run-diagrams.cmd input-description.md output-dir\
```

---

## Launcher Scripts

| Script | Platform | Mode | Description |
|--------|----------|------|-------------|
| `run.sh` | Linux/Mac/Git Bash | Foreground | Runs to completion, no timeout |
| `run-bg.sh` | Linux/Mac/Git Bash | Background | nohup + PID tracking, Telegram notifies |
| `run.cmd` | Windows | Foreground | Runs to completion, no timeout |
| `run-bg.cmd` | Windows | Background | `start /B` + log file, Telegram notifies |
| `run-diagrams.sh` | Linux/Mac/Git Bash | Foreground | Standalone diagram-agent |
| `run-diagrams.cmd` | Windows | Foreground | Standalone diagram-agent |

---

## Pipeline Phases

1. **Planning** -- LLM decomposes the PRD into a DAG of tasks (models, repos, services, middleware, endpoints)
2. **Execution** -- Each task runs through a fix loop: CodeGen -> ESLint -> QA (real tests against MongoDB Docker)
3. **Assembly** -- Wires endpoint plugins into the main `index.mts` entry file
4. **Scaffolding** -- Generates `package.json`, `tsconfig.json`, `.gitignore`, `README.md`
5. **DevContainer** -- Generates `.devcontainer/` with Docker Compose, Dockerfile, and working `.env` defaults
6. **Integration Testing** -- Runs integration tests for completed tasks
7. **Documentation** -- Generates API documentation from completed code
8. **Diagrams** -- Generates architecture diagrams (interactive prompt or `--diagrams`/`--no-diagrams`)
9. **Validation** -- Installs deps, starts the server, screenshots Swagger UI via Playwright
10. **Report** -- Generates a run report with token usage and cost summary
11. **Post-success prompts** -- If all tasks passed, optionally generate a frontend UI or IaC (AWS CDK / Terraform)

## Multi-Tier LLM Fallback

Each task starts with **qwen3-coder-next** (Ollama Cloud). If the circuit breaker detects the task is stuck (5 consecutive iterations with no error reduction), it escalates:

1. **Tier 1**: qwen3-coder-next (Ollama Cloud) -- 20 iterations
2. **Tier 2**: GPT-5.4 (OpenAI) -- 16 iterations
3. **Tier 3**: Claude Sonnet 4.6 (Anthropic) -- 16 iterations
4. **Diagnostic**: Cross-model root cause analysis + 30 cycles per model

## Notifications

Configure Telegram in `.env` to receive progress updates:

```
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
NOTIFICATION_INTERVAL_MS=300000   # 5 minutes (default)
```

Events reported: task started, passed, failed, circuit break, fallback escalation, hard failure, pipeline complete.

---

## Workspace Structure

All output is written to `.workspace/<run-id>/`:

```
.workspace/<run-id>/
  config.json                # Run configuration
  plan.json                  # Task graph
  execution-summary.json     # Final counts
  token-usage.json           # LLM token tracking
  pipeline-result.json       # Final result metadata
  report.md                  # Human-readable run report
  SESSION-HANDOFF.md         # Session handoff document
  logs/run.log               # Full structured log (JSON)
  output/                    # Generated API project (runnable)
    src/
      index.mts              # Assembled entry point with all routes
      env.mts                # TypeBox-validated environment config
      ioc/                   # DI container
      features/              # Feature-based domain folders
      api/                   # Routes and plugins
    .devcontainer/           # Zero-setup dev environment
      devcontainer.json
      docker-compose.yml
      Dockerfile
    package.json
    tsconfig.json
    .env                     # Working defaults for devcontainer
    .env.example             # Documented env var template
    .gitignore
    README.md
    graphs/                  # Architecture diagrams (if generated)
  docs/
    assembled-index.mts      # Copy of final wired entry file
    hoppscotch-collection.json
  tasks/<task-id>/
    code/                    # Final code for this task
    tests/                   # Test files
    status.json              # Task completion state (used by --resume)
    iterations/              # Per-iteration snapshots
```

---

## Environment Variables

### LLM Provider (at least one required)

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | Which provider to use: `ollama`, `openai`, or `anthropic` | `ollama` |
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | Ollama Cloud API key (optional, for cloud codegen) | -- |
| `OPENAI_API_KEY` | OpenAI API key (required when `LLM_PROVIDER=openai`) | -- |
| `ANTHROPIC_API_KEY` | Anthropic API key (required when `LLM_PROVIDER=anthropic`) | -- |

If additional provider keys are set beyond the primary, they enable automatic [fallback escalation](#multi-tier-llm-fallback).

### Pipeline Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_FIX_ITERATIONS` | Max fix loop iterations per task | `5` |
| `MAX_CONCURRENCY` | Max parallel task execution | `4` |
| `LLM_TIMEOUT_MS` | LLM call timeout | `1800000` (30 min) |
| `TASK_COST_LIMIT` | Per-task LLM cost ceiling (USD) | `3.00` |
| `WORKSPACE_DIR` | Output directory | `.workspace` |
| `INTEGRATION_PORT` | Base port for integration tests | `4100` |

### Notifications (optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for progress updates | -- |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for progress updates | -- |
| `NOTIFICATION_INTERVAL_MS` | Status update interval | `300000` (5 min) |

### Observability (optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `LANGSMITH_TRACING` | Enable LangSmith tracing | `true` |
| `LANGSMITH_API_KEY` | LangSmith API key (tracing disabled if empty) | -- |
| `LANGSMITH_PROJECT` | LangSmith project name | `api-generator-agent` |
