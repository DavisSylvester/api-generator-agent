# agent-one Usage Guide

## Overview

agent-one is a production-ready Elysia API generator that runs on Bun. It generates complete, layered TypeScript APIs with CRUD operations, Zod validation, MongoDB integration, Winston logging, and full test suites.

agent-one can be used in two modes:

1. **CLI mode** -- standalone command-line tool
2. **Claude Code agent mode** -- invoked as a custom agent within Claude Code

Both modes share 100% of the core generation logic.

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd api-generator

# Install dependencies
bun install
```

---

## CLI Commands

### New run

```bash
bun run src/index.mts --prd <file> [options]
```

### Resume

```bash
bun run src/index.mts --resume <run-id> [options]
```

### Status / List

```bash
bun run src/index.mts --list-runs
bun run src/index.mts --status <run-id>
```

### Full option reference

```
Options:
  -p, --prd <file>       Path to PRD markdown file (required for new runs)
  -r, --resume <run-id>  Resume a previous run (skips completed tasks)
  -i, --iterations <n>   Max fix loop iterations per task (default: 5)
  -t, --max-tasks <n>    Max tasks to execute (default: all)
  -c, --concurrency <n>  Max parallel tasks (default: 4)
  -d, --diagrams         Generate diagrams (no prompt)
  -D, --no-diagrams      Skip diagram generation (no prompt)
  -N, --no-docs          Skip documentation generation
  -V, --no-validate      Skip output validation (bun install, swagger screenshot)
      --ui               Generate UI after successful run (no prompt)
      --no-ui            Skip UI generation (no prompt)
      --iac <provider>   Generate IaC after success: "cdk" or "terraform" (no prompt)
      --no-iac           Skip IaC generation (no prompt)
  -l, --list-runs        List all previous runs
  -s, --status <run-id>  Show detailed status of a run
  -h, --help             Show help

When --diagrams/--no-diagrams, --ui/--no-ui, or --iac/--no-iac are omitted
the pipeline prompts you interactively.
```

### Interactive prompts

By default, the pipeline asks three questions:

1. **Before pipeline**: `Generate architecture diagrams? [Y/n]`
2. **After success**: `Generate a frontend UI for this API? [y/N]`
3. **After success**: IaC provider menu (AWS CDK, Terraform, or skip)

Pass flags to bypass any prompt:

```bash
# Fully non-interactive
bun run src/index.mts --prd my-api.md --diagrams --no-ui --iac terraform

# Or skip everything
bun run src/index.mts --prd my-api.md --no-diagrams --no-ui --no-iac
```

UI and IaC prompts only appear when every task passes. If any task fails, the pipeline exits without asking.

---

## Legacy Mode

For backwards compatibility, positional arguments are still supported:

```bash
bun run src/index.mts ./path/to/prd.md [max-iterations] [max-tasks]
```

---

## PRD File Format

A PRD is a markdown file describing your API. The planning agent needs:

1. **Overview** -- one paragraph describing the API
2. **Data Models** -- entities with field names, types, and constraints
3. **Endpoints** -- HTTP method, path, and behavior
4. **Business Rules** -- validation, access control, domain logic

See [`sample-prds/`](../sample-prds/) for examples ranging from simple to complex.

---

## Pipeline Phases

1. **Planning** -- LLM decomposes the PRD into a DAG of tasks
2. **Execution** -- Each task: CodeGen -> ESLint -> QA (real tests against Docker MongoDB)
3. **Assembly** -- Wires endpoint plugins into the main entry file
4. **Scaffolding** -- Generates `package.json`, `tsconfig.json`, `.gitignore`, `README.md`
5. **DevContainer** -- Generates `.devcontainer/` with Docker Compose, working `.env`
6. **Integration Testing** -- Runs integration tests for completed tasks
7. **Documentation** -- Generates API docs from completed code
8. **Diagrams** -- Architecture diagrams (prompted or `--diagrams`/`--no-diagrams`)
9. **Validation** -- `bun install`, start server, Playwright Swagger screenshot
10. **Report** -- Run report with token usage and cost
11. **Post-success** -- Optional UI generation and IaC (AWS CDK / Terraform)

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM provider: `ollama`, `openai`, or `anthropic` | `ollama` |
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | Ollama Cloud API key (optional) | -- |
| `OPENAI_API_KEY` | OpenAI API key | -- |
| `ANTHROPIC_API_KEY` | Anthropic API key | -- |
| `MAX_FIX_ITERATIONS` | Max fix loop iterations per task | `5` |
| `MAX_CONCURRENCY` | Max parallel task execution | `4` |
| `TASK_COST_LIMIT` | Per-task LLM cost ceiling (USD) | `3.00` |
| `WORKSPACE_DIR` | Output workspace directory | `.workspace` |
| `INTEGRATION_PORT` | Base port for integration tests | `4100` |
| `LLM_TIMEOUT_MS` | LLM request timeout | `1800000` (30 min) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications | -- |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications | -- |

The pipeline verifies the selected LLM provider is reachable at startup. If Ollama isn't running or an API key is missing, it exits with setup instructions.

---

## Output Structure

Each run creates a workspace at `.workspace/<run-id>/`:

```
.workspace/<run-id>/
  config.json              # Run configuration
  plan.json                # Task graph (DAG)
  execution-summary.json   # Final counts
  token-usage.json         # LLM token tracking
  pipeline-result.json     # Final result metadata
  report.md                # Human-readable run report
  SESSION-HANDOFF.md       # Session handoff document
  logs/run.log             # Full structured log (JSON)
  output/                  # Generated API project (runnable)
    src/                   # Application source code
    .devcontainer/         # Zero-setup dev environment
    package.json
    tsconfig.json
    .env                   # Working defaults
    .env.example
    README.md
  tasks/<task-id>/
    code/                  # Final code for this task
    tests/                 # Test files
    status.json            # Completion state (used by --resume)
    iterations/            # Per-iteration snapshots
```
