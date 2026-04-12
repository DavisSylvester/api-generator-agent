# API Generator Agent

Autonomous pipeline that takes a PRD (Product Requirements Document) and generates a complete Elysia + BunJS API with models, repositories, services, middleware, endpoints, and tests. Uses LLMs to generate code, validates with ESLint, runs real tests against MongoDB Docker, and self-corrects through a multi-tier fix loop.

## Prerequisites

- [Bun](https://bun.sh/) v1.1+
- [Docker](https://www.docker.com/) (for MongoDB test containers)
- API keys configured in `.env` (see [Environment Variables](#environment-variables))

## Quick Start

```bash
# Install dependencies
bun install

# Run a new pipeline from a PRD
./run.sh --prd my-app-prd.md --iterations 20

# Windows
run.cmd --prd my-app-prd.md --iterations 20
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
  -D, --no-diagrams      Skip diagram generation phase
  -N, --no-docs          Skip documentation generation phase
  -l, --list-runs        List all previous runs with status
  -s, --status <run-id>  Show detailed status of a specific run
  -h, --help             Show help message
```

Legacy positional args are still supported for backward compatibility:

```bash
bun run src/index.mts <prd-file> [max-iterations] [max-tasks]
```

---

## Examples

### Start a new run

```bash
# Basic run with default settings
./run.sh --prd my-app-prd.md

# With 20 fix iterations per task, skip diagram generation
./run.sh --prd my-app-prd.md --iterations 20 --no-diagrams

# Limit to first 5 tasks only (useful for testing)
./run.sh --prd my-app-prd.md --iterations 10 --max-tasks 5
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
3. **Documentation** -- Generates API documentation from completed code
4. **Diagrams** -- Generates architecture diagrams via the diagram-agent

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
  config.json              # Run configuration
  plan.json                # Task graph
  execution-summary.json   # Final counts
  token-usage.json         # LLM token tracking
  pipeline-result.json     # Final result metadata
  logs/run.log             # Full structured log (JSON)
  output/                  # Generated API code
    src/
      types/
      repositories/
      services/
      routes/
      middleware/
      index.mts
    graphs/                # Architecture diagrams
  tasks/<task-id>/
    code/                  # Final code for this task
    tests/                 # Test files
    status.json            # Task completion state (used by --resume)
    iterations/            # Per-iteration snapshots
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OLLAMA_HOST` | Local Ollama server URL | `http://192.168.128.230:11434` |
| `OLLAMA_API_KEY` | Ollama Cloud API key (for codegen) | -- |
| `ANTHROPIC_API_KEY` | Anthropic API key (Tier 3 fallback) | -- |
| `OPENAI_API_KEY` | OpenAI API key (Tier 2 fallback) | -- |
| `MAX_FIX_ITERATIONS` | Default max iterations per task | `5` |
| `MAX_CONCURRENCY` | Default parallel task limit | `4` |
| `LLM_TIMEOUT_MS` | LLM call timeout | `1800000` (30 min) |
| `WORKSPACE_DIR` | Output directory | `.workspace` |
| `INTEGRATION_PORT` | Base port for integration tests | `4100` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications | -- |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | -- |
| `NOTIFICATION_INTERVAL_MS` | Status update interval | `300000` (5 min) |
