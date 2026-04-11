# API Generator Agent

A multi-agent code generation pipeline that takes a Product Requirements Document (PRD) and produces a complete, production-ready Elysia web API with BunJS. The system decomposes requirements into a dependency-ordered task graph, generates TypeScript code for each task, lints it, runs real tests against MongoDB, and iterates until all tests pass.

## How It Works

```
PRD  -->  Planning Agent  -->  Task Graph  -->  [Per-Task Pipeline]  -->  Assembled API
                                                      |
                                          Codegen --> Lint --> Test
                                              ^                |
                                              |   fix loop     |
                                              +--- errors -----+
```

**Phase 1 - Planning:** An LLM decomposes the PRD into a directed acyclic graph (DAG) of tasks with dependencies. Task types include `setup`, `model`, `repository`, `service`, `middleware`, and `endpoint`.

**Phase 2 - Code Generation:** Tasks execute in topological order with configurable concurrency (default: 4 parallel). Each task enters a fix loop:
1. **Codegen** - LLM generates TypeScript source files and tests
2. **Lint** - ESLint auto-fixes the generated code
3. **QA** - Runs unit tests (via `bun test`) and integration tests against a real MongoDB container
4. If tests fail, errors feed back into the codegen agent for a fix attempt
5. Loop repeats up to `MAX_FIX_ITERATIONS` (default: 5)

**Phase 2.25 - Assembly:** Completed endpoint plugins are wired into a single `index.mts` entry file with `.use()` calls.

**Phase 2.5 - Integration Testing:** Hoppscotch CLI runs integration tests against each completed task's endpoints.

**Phase 3 - Documentation:** All generated code is analyzed and a Hoppscotch API collection is produced.

**Phase 4 - Report:** A consolidated `report.md` is written to the workspace with the full run summary — task plan, pass/fail results, iteration counts, cost breakdown per model and per task, integration test results, generated file list, and links to all output artifacts.

**Fallback Escalation:** If the primary LLM fails on a task, the system escalates through configured fallback tiers (e.g., Ollama -> OpenAI -> Anthropic) with independent iteration budgets per tier.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Docker](https://www.docker.com/) (for MongoDB test containers)
- At least one LLM provider configured (see [Configuration](#configuration))

## Installation

```bash
git clone <repo-url>
cd api-generator-agent
bun install
```

> **First time?** Follow the [Getting Started Guide](docs/getting-started.md) for a step-by-step walkthrough with a sample PRD.

## Configuration

Set environment variables directly or in a `.env` file (Bun loads `.env` automatically).

### LLM Provider

| Variable | Description | Default |
|---|---|---|
| `LLM_PROVIDER` | Primary LLM backend: `ollama`, `openai`, or `anthropic` | `ollama` |
| `OLLAMA_HOST` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_API_KEY` | Ollama cloud API key (uses `https://api.ollama.com` for codegen when set) | - |
| `OPENAI_API_KEY` | OpenAI API key (required when `LLM_PROVIDER=openai`) | - |
| `ANTHROPIC_API_KEY` | Anthropic API key (required when `LLM_PROVIDER=anthropic`) | - |

### Pipeline

| Variable | Description | Default |
|---|---|---|
| `MAX_FIX_ITERATIONS` | Max codegen/test fix loop iterations per task (1-20) | `5` |
| `MAX_CONCURRENCY` | Parallel task execution slots (1-8) | `4` |
| `WORKSPACE_DIR` | Output directory for run artifacts | `.workspace` |
| `LLM_TIMEOUT_MS` | LLM response timeout in ms (10s-60min) | `1800000` (30min) |
| `INTEGRATION_PORT` | Base port for integration test servers (each task offsets by +1) | `4100` |

### Observability (optional)

| Variable | Description | Default |
|---|---|---|
| `LANGSMITH_TRACING` | Enable LangSmith tracing | `true` |
| `LANGSMITH_API_KEY` | LangSmith API key | - |
| `LANGSMITH_ENDPOINT` | LangSmith endpoint URL | `https://api.smith.langchain.com` |
| `LANGSMITH_PROJECT` | LangSmith project name | `api-generator-agent` |

### Example `.env`

```bash
# Use OpenAI as primary, Anthropic as fallback
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Or use a self-hosted Ollama instance
# LLM_PROVIDER=ollama
# OLLAMA_HOST=http://my-gpu-server:11434

MAX_FIX_ITERATIONS=5
MAX_CONCURRENCY=4
```

## Usage

```
bun run src/index.mts <prd-file-or-text> [max-iterations] [max-tasks]
```

| Argument | Required | Description |
|---|---|---|
| `prd-file-or-text` | Yes | Path to a PRD file, raw PRD text, or `-` for stdin |
| `max-iterations` | No | Override `MAX_FIX_ITERATIONS` for this run |
| `max-tasks` | No | Only process the first N tasks from the plan |

The first argument is auto-detected: if it matches an existing file, it's read as a file. Otherwise it's treated as raw PRD text. Pass `-` to read from stdin.

### Examples

```bash
# From a file
bun run src/index.mts sample-prd.md

# Raw text
bun run src/index.mts "Build a notes API with user auth, CRUD on notes, and pagination"

# Piped from stdin
cat my-prd.md | bun run src/index.mts -

# Limit to 3 fix iterations and only the first 5 tasks
bun run src/index.mts beautician-scheduling-prd.md 3 5

# Use OpenAI for a single run
LLM_PROVIDER=openai OPENAI_API_KEY=sk-... bun run src/index.mts sample-prd.md

# Point to a remote Ollama instance
OLLAMA_HOST=http://192.168.1.100:11434 bun run src/index.mts sample-prd.md
```

## Writing a PRD

The planning agent expects a markdown document describing your API. Include:

1. **Overview** - What the API does
2. **Data Models** - Entities with their fields and types
3. **Endpoints** - HTTP method, path, description, auth requirements
4. **Business Rules** - Validation, access control, domain logic

### Minimal Example

```markdown
# Todo API - Product Requirements Document

## Overview
Build a simple Todo API with user authentication. Users can create,
read, update, and delete todos. Each todo belongs to a user.

## Data Models

### User
- id: UUID (auto-generated)
- email: string (unique, required)
- name: string (required)
- createdAt: datetime

### Todo
- id: UUID (auto-generated)
- title: string (required, max 200 chars)
- description: string (optional, max 2000 chars)
- completed: boolean (default false)
- priority: enum (low, medium, high)
- userId: UUID (foreign key to User)
- createdAt: datetime
- updatedAt: datetime

## Endpoints

### Auth
- POST /api/v1/auth/register - Register a new user (email, name, password)
- POST /api/v1/auth/login - Login and receive a JWT token

### Users
- GET /api/v1/users/me - Get current user profile (requires auth)

### Todos
- GET /api/v1/todos - List all todos for the authenticated user (pagination)
- POST /api/v1/todos - Create a new todo
- GET /api/v1/todos/:id - Get a specific todo
- PUT /api/v1/todos/:id - Update a todo
- DELETE /api/v1/todos/:id - Delete a todo
- PATCH /api/v1/todos/:id/complete - Toggle todo completion status

## Business Rules
- Users can only see and modify their own todos
- Pagination defaults: page=1, limit=20, max limit=100
- Todo title is required and cannot be empty
- Priority defaults to "medium" if not specified

## Non-Functional
- All responses in JSON
- Standard error format: { error: string, statusCode: number }
- Health check at GET /healthz
```

### Advanced Example

The repo includes `beautician-scheduling-prd.md`, a multi-tenant appointment scheduling API with 6 entities, 20+ endpoints, discount codes, availability windows, and grace period logic. This demonstrates the agent handling complex domain rules and cross-entity dependencies.

## Sample Output

Running the Todo API PRD above produces output like the following:

```
$ bun run src/index.mts sample-prd.md

2026-04-11T14:32:01.000Z [info] Reading PRD from: /home/user/api-generator-agent/sample-prd.md
2026-04-11T14:32:01.001Z [info] PRD loaded (1247 chars)
2026-04-11T14:32:01.001Z [info] Config: maxIterations=5, concurrency=4
2026-04-11T14:32:01.001Z [info] LLM provider: openai

2026-04-11T14:32:01.002Z [info] Phase 1: Planning - generating task graph from PRD
2026-04-11T14:32:08.451Z [info] Planning complete: 8 tasks generated in 7449ms (model: gpt-5.4)
2026-04-11T14:32:08.451Z [info]   [plan] Task: setup-foundation - "Project setup" (depends: [])
2026-04-11T14:32:08.451Z [info]   [plan] Task: model-user - "User schema" (depends: [setup-foundation])
2026-04-11T14:32:08.451Z [info]   [plan] Task: model-todo - "Todo schema" (depends: [setup-foundation])
2026-04-11T14:32:08.452Z [info]   [plan] Task: middleware-auth - "JWT auth middleware" (depends: [model-user])
2026-04-11T14:32:08.452Z [info]   [plan] Task: repo-user - "User repository" (depends: [model-user])
2026-04-11T14:32:08.452Z [info]   [plan] Task: repo-todo - "Todo repository" (depends: [model-todo])
2026-04-11T14:32:08.452Z [info]   [plan] Task: endpoint-auth - "Auth endpoints" (depends: [repo-user, middleware-auth])
2026-04-11T14:32:08.452Z [info]   [plan] Task: endpoint-todos - "Todo endpoints" (depends: [repo-todo, middleware-auth])

2026-04-11T14:32:08.453Z [info] Phase 2: Executing task graph
2026-04-11T14:32:08.453Z [info]   [executor] Ready: setup-foundation
2026-04-11T14:32:22.100Z [info]   [codegen] Success with model gpt-5.4 (4200ms)
2026-04-11T14:32:23.500Z [info]   [qa] setup-foundation: unit PASS, integration PASS
2026-04-11T14:32:23.501Z [info]   [executor] Ready: model-user, model-todo
...
2026-04-11T14:35:47.200Z [info] Task execution complete: 8 completed, 0 failed, 0 skipped (of 8)
2026-04-11T14:35:47.200Z [info]   [result] [OK] setup-foundation - 1 iterations
2026-04-11T14:35:47.200Z [info]   [result] [OK] model-user - 1 iterations
2026-04-11T14:35:47.200Z [info]   [result] [OK] model-todo - 1 iterations
2026-04-11T14:35:47.200Z [info]   [result] [OK] middleware-auth - 2 iterations
2026-04-11T14:35:47.201Z [info]   [result] [OK] repo-user - 1 iterations
2026-04-11T14:35:47.201Z [info]   [result] [OK] repo-todo - 1 iterations
2026-04-11T14:35:47.201Z [info]   [result] [OK] endpoint-auth - 3 iterations
2026-04-11T14:35:47.201Z [info]   [result] [OK] endpoint-todos - 2 iterations

2026-04-11T14:35:47.202Z [info] Phase 2.25: Assembly - wiring endpoint plugins into index.mts
2026-04-11T14:35:47.250Z [info]   [assembly] Found plugin: authRoutes in src/routes/auth.mts
2026-04-11T14:35:47.250Z [info]   [assembly] Found plugin: todoRoutes in src/routes/todos.mts
2026-04-11T14:35:47.251Z [info]   [assembly] Assembled index.mts with 2 plugin(s)

2026-04-11T14:35:47.252Z [info] Phase 3: Generating documentation
2026-04-11T14:35:52.100Z [info] Documentation generated successfully

2026-04-11T14:35:52.500Z [info] === Pipeline Results ===
2026-04-11T14:35:52.500Z [info] Run ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
2026-04-11T14:35:52.500Z [info] Duration: 231498ms
2026-04-11T14:35:52.500Z [info] Documentation: generated
2026-04-11T14:35:52.500Z [info] Tasks: 8 completed, 0 failed, 0 skipped
2026-04-11T14:35:52.501Z [info] Workspace: .workspace/a1b2c3d4-e5f6-7890-abcd-ef1234567890/
```

## Output Structure

Each run creates a workspace directory with all artifacts:

```
.workspace/{run-id}/
  config.json                    # Pipeline configuration for this run
  plan.json                      # Task graph (DAG) generated from the PRD
  execution-summary.json         # Final status of all tasks
  integration-results.json       # Per-task integration test results
  pipeline-result.json           # Run duration and metadata
  report.md                      # Full human-readable run report
  logs/
    run.log                      # Full pipeline log (JSON lines)
  docs/
    assembled-index.mts          # Final Elysia app with all plugins wired
    hoppscotch-collection.json   # Generated API collection for Hoppscotch
  tasks/
    setup-foundation/
      code/
        src/index.mts            # Elysia app, MongoDB connection, health endpoint
        src/db.mts               # Database connection helper
      code-linted/               # ESLint-corrected versions
      tests/
        setup-foundation.test.mts
      integration/               # Hoppscotch collection + env for this task
      iterations/
        0/code/                  # Code snapshot from iteration 0
        1/code/                  # Code snapshot from iteration 1 (if fix needed)
      qa-results.json            # Unit + integration test results
      qa-knowledge.md            # Accumulated learnings from test failures
      status.json
    model-user/
      code/
        src/types/user.mts       # TypeBox schema
        src/types/index.mts      # Barrel export
      ...
    endpoint-auth/
      code/
        src/routes/auth.mts      # Elysia plugin with register + login routes
      ...
```

### Key Output Files

| File | Description |
|---|---|
| `report.md` | Full run report: task plan, results, cost breakdown (per model + per task), integration tests, generated files, output artifacts. |
| `docs/assembled-index.mts` | The final Elysia entry file with all endpoint plugins imported and mounted via `.use()`. This is the runnable API. |
| `docs/hoppscotch-collection.json` | Import into [Hoppscotch](https://hoppscotch.io) to test all endpoints interactively. |
| `plan.json` | The task DAG - useful for understanding how the PRD was decomposed. |
| `execution-summary.json` | Check which tasks passed or failed and their iteration counts. |
| `tasks/{id}/qa-knowledge.md` | Error patterns and fixes discovered during the run - reused across iterations. |

## Generated API Stack

The agent produces APIs using the following stack:

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Framework | [Elysia](https://elysiajs.com) |
| Database | MongoDB (native driver) |
| Validation | [TypeBox](https://github.com/sinclairzx81/typebox) |
| Auth | JWT via [jose](https://github.com/panva/jose), passwords via `Bun.password` |
| Testing | `bun test` (unit), [Hoppscotch CLI](https://docs.hoppscotch.io/documentation/clients/cli/overview) (integration) |

All generated endpoints follow a standard response shape:

```json
{
  "statusCode": 200,
  "message": "Todos retrieved successfully",
  "date": "2026-04-11T14:32:00.000Z",
  "source": "/api/v1/todos",
  "data": []
}
```

## Task Types

The planning agent decomposes PRDs into these task types, executed in dependency order:

| Type | Responsibility | Example Output |
|---|---|---|
| `setup` | Elysia app scaffold, MongoDB connection, health endpoint, error handler | `src/index.mts`, `src/db.mts` |
| `model` | TypeBox schemas with barrel exports | `src/types/user.mts`, `src/types/index.mts` |
| `repository` | Data access layer (MongoDB queries, Result types) | `src/repositories/user-repository.mts` |
| `service` | Business logic orchestration | `src/services/todo-service.mts` |
| `middleware` | Auth guards, validators (Elysia `.guard()` + `.resolve()`) | `src/middleware/auth.mts` |
| `endpoint` | Elysia route plugins (mounted via `.use()` in assembly) | `src/routes/todos.mts` |

## Knowledge Bases

The agent accumulates learnings from test failures in `docs/knowledge-bases/`. Each task has its own knowledge file that persists across runs. When a task encounters a test error and fixes it, the pattern is recorded so future runs avoid the same mistake.

Example entry from `endpoint-auth-knowledge.md`:

```markdown
## Error: auth middleware must use .as('plugin')
- **Condition**: Guard/resolve not applied to routes in consuming endpoint
- **Resolution**: Add .as('plugin') after .guard().resolve() chain
- **Status**: Resolved
```

## Fallback Escalation

When configured with multiple API keys, the agent escalates through LLM tiers if the primary model fails on a task:

```
Primary (LLM_PROVIDER) --> Fallback Tier 1 --> Fallback Tier 2
     5 iterations            16 iterations      16 iterations
```

For example, with `LLM_PROVIDER=ollama`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` all set:

1. **Primary**: Ollama (local, 5 iterations)
2. **Fallback 1**: OpenAI GPT-5.4 (16 iterations)
3. **Fallback 2**: Anthropic Claude Sonnet 4.6 (16 iterations)

The primary provider is automatically excluded from fallback tiers to avoid redundancy.

## Example PRDs

| PRD | Complexity | Entities | Endpoints | Description |
|---|---|---|---|---|
| [`examples/bookmark-api-prd.md`](examples/bookmark-api-prd.md) | Medium | 3 (User, Folder, Bookmark) | 14 | Bookmark manager with folders, tags, and search |
| [`sample-prd.md`](sample-prd.md) | Simple | 2 (User, Todo) | 9 | Classic todo app with priorities and pagination |
| [`beautician-scheduling-prd.md`](beautician-scheduling-prd.md) | Complex | 6 | 20+ | Multi-tenant appointment scheduling with grace periods and discount codes |

Start with the bookmark API if this is your first time:

```bash
bun run src/index.mts examples/bookmark-api-prd.md
```

## Plan Caching

The planning phase is cached by PRD content hash. If you run the same PRD twice, the second run reuses the task graph from the first without calling the LLM. Cache files are stored in `.workspace/.plan-cache/`.

To force re-planning, delete the cache directory:

```bash
rm -rf .workspace/.plan-cache/
```

## Project Structure

```
src/
  index.mts                     # CLI entry point
  config/
    env.mts                     # Zod-validated environment schema
    models.mts                  # Per-provider model name mappings
    fallback-tiers.mts          # Fallback tier interface
  interfaces/
    i-llm-factory.mts           # Common LLM factory interface
  llm/
    ollama-factory.mts          # Ollama ChatModel factory
    openai-factory.mts          # OpenAI ChatModel factory
    anthropic-factory.mts       # Anthropic ChatModel factory
    stream-invoke.mts           # Streaming LLM invocation
    with-timeout.mts            # LLM timeout wrapper
  agents/
    base-agent.mts              # Abstract agent with model chain + fallback
    planning-agent.mts          # PRD -> task graph
    codegen-agent.mts           # Task -> TypeScript code + tests
    qa-agent.mts                # Test runner (bun test + Hoppscotch CLI)
    eslint-agent.mts            # Lint auto-fixer
    documentation-agent.mts     # Code -> Hoppscotch collection
  orchestrator/
    pipeline.mts                # Main pipeline (phases 1-3)
    fix-loop.mts                # Single-task codegen/lint/test loop
    fallback-fix-loop.mts       # Fix loop with LLM tier escalation
  graph/
    parallel-executor.mts       # Topological DAG executor with concurrency
    task-graph.mts              # DAG validation
  container/
    di.mts                      # Dependency injection / factory wiring
  io/
    workspace.mts               # Workspace directory management
    file-protocol.mts           # JSON/code file read/write helpers
  prompts/                      # System + user prompts for each agent
  types/                        # TypeScript interfaces (task, pipeline, result)
  validators/                   # Import/export validation for generated code
```

## License

ISC
