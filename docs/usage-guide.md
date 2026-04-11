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

### generate

Generate a new API project from a PRD file or natural language prompt.

```bash
# From a PRD file
bun run src/index.mts generate my-api --prd ./requirements.md

# From a natural language prompt
bun run src/index.mts generate my-api --prompt "Build a work order API with status tracking"

# Dry run (plan only, no files written)
bun run src/index.mts generate my-api --prd ./requirements.md --dry-run

# With custom options
bun run src/index.mts generate my-api --prd ./prd.md --max-iterations 10 --output ./output
```

**Required arguments:**
- `<project-name>` -- name for the generated project
- Either `--prd <path>` or `--prompt <text>` must be provided

**Optional flags:**
- `--dry-run` -- output the generation plan without writing any files
- `--max-iterations <n>` -- maximum fix loop iterations per feature (default: 5)
- `--output <dir>` -- output directory for the workspace (default: .workspace)

### resume

Resume an interrupted generation from where it left off.

```bash
bun run src/index.mts resume 01HXYZ123456
bun run src/index.mts resume 01HXYZ123456 --max-iterations 8
```

**Required arguments:**
- `<run-id>` -- the ULID run ID from a previous generation

### status

Show the current generation status for a run.

```bash
bun run src/index.mts status 01HXYZ123456
bun run src/index.mts status 01HXYZ123456 --output /custom/workspace
```

### trace

Show the trace summary for a completed or in-progress run.

```bash
bun run src/index.mts trace 01HXYZ123456
```

---

## Legacy Mode

For backwards compatibility, agent-one also supports the original positional argument syntax:

```bash
bun run src/index.mts ./path/to/prd.md [max-iterations] [max-tasks]
```

This mode is automatically detected when the first argument is not a recognized command.

---

## PRD File Format

A PRD file is a markdown document with checkboxes for each feature:

```markdown
# My API

- [ ] Feature: Work Orders -- CRUD for work orders with status and priority
- [ ] Feature: Technicians -- Technician management with email
- [ ] Feature: Assignments -- Assignment tracking
```

Features are extracted from lines matching the pattern:
```
- [ ] Feature: <name> -- <description>
```

The description is used to infer fields (e.g., "with status" adds a status field, "with email" adds an email field).

---

## Dry Run Mode

The `--dry-run` flag runs the planning phase only:

1. Parses the input (PRD or prompt)
2. Extracts features and entities
3. Resolves dependencies (topological sort)
4. Generates the step-by-step plan
5. Prints the plan to console
6. Exits without writing any files

This is useful for previewing what agent-one would generate before committing to a full run.

---

## Claude Code Agent Mode

When invoked as a Claude Code custom agent, use `src/agent-bridge.mts`:

```bash
bun run src/agent-bridge.mts --prompt "Build a work order API" --project work-orders
bun run src/agent-bridge.mts --prd ./requirements.md --project my-api
bun run src/agent-bridge.mts --run-id 01HXYZ123456  # Resume
bun run src/agent-bridge.mts --prd ./prd.md --dry-run
```

The agent bridge:
- Uses the same core orchestration as the CLI
- Reports progress through console output (captured by Claude Code)
- Uses CallbackReviewGate for human review checkpoints

---

## Generation Flow

1. **Parse** -- Extract features, entities, and relationships from input
2. **Plan** -- Order features by dependency, create generation steps
3. **Review** -- Present plan for approval (human-in-the-loop)
4. **Generate** -- For each feature (bottom-up):
   - Interfaces (one per file, barrel exports)
   - Zod schemas (validation/ folder)
   - Repository (extends BaseRepository)
   - Service (constructor injection)
   - Router (swagger refs in docs/)
   - Tests (unit + integration)
5. **Verify** -- ESLint, bun test, smoke test, Playwright screenshot
6. **Commit** -- Git commit with conventional message per feature
7. **Finalize** -- Session summary, documentation update

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| OLLAMA_HOST | Ollama API endpoint | http://192.168.128.230:11434 |
| OLLAMA_API_KEY | Ollama cloud API key (enables cloud models) | -- |
| ANTHROPIC_API_KEY | Anthropic API key (enables Claude fallback) | -- |
| OPENAI_API_KEY | OpenAI API key (enables GPT fallback) | -- |
| MAX_FIX_ITERATIONS | Default max fix loop iterations | 5 |
| MAX_CONCURRENCY | Max parallel task execution | 4 |
| WORKSPACE_DIR | Output workspace directory | .workspace |
| INTEGRATION_PORT | Base port for integration tests | 4100 |
| LLM_TIMEOUT_MS | LLM request timeout in milliseconds | 1800000 |

---

## Output Structure

Each generation run creates a workspace at `.workspace/<run-id>/` containing:

```
.workspace/<run-id>/
  config.json           # Run configuration
  plan.json             # Generated task graph
  features.json         # Feature status tracking
  execution-summary.json
  pipeline-result.json
  SESSION-HANDOFF.md    # Session handoff document
  run.log               # Full execution log
  tasks/                # Per-task code and iterations
  .docs/                # Trace entries and screenshots
```
