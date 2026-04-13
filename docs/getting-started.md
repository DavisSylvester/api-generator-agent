# Getting Started

A step-by-step walkthrough for generating your first API from a PRD.

## Step 1: Install Dependencies

```bash
cd api-generator-agent
bun install
```

## Step 2: Start Docker

The agent spins up a MongoDB container to run real integration tests against your generated code. Make sure Docker is running:

```bash
docker info
```

If you see connection errors, start Docker Desktop (Windows/Mac) or the Docker daemon (Linux).

## Step 3: Configure Your LLM Provider

Create a `.env` file in the project root. Pick one of the three provider options below.

### Option A: Ollama (local, free)

Install [Ollama](https://ollama.com), pull a model, then:

```bash
# .env
LLM_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
```

The agent uses these Ollama models by default:
- `qwen3.5:27b` for planning and documentation
- `qwen3-coder-next` for code generation and QA

Pull them before your first run:

```bash
ollama pull qwen3.5:27b
ollama pull qwen3-coder-next
```

### Option B: OpenAI (cloud)

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

### Option C: Anthropic (cloud)

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Adding Fallback Tiers (optional)

Set additional API keys to enable fallback escalation. The primary provider is used first. If it fails on a task after `MAX_FIX_ITERATIONS`, the agent escalates to the next available provider.

```bash
# .env — primary is OpenAI, falls back to Anthropic
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Step 4: Write a PRD

Create a markdown file that describes your API. The planning agent needs four things:

1. **Overview** - one paragraph describing the API
2. **Data Models** - entities with field names, types, and constraints
3. **Endpoints** - HTTP method, path, and what it does
4. **Business Rules** - validation, access control, domain logic

Sample PRDs are included in [`sample-prds/`](../sample-prds/):

| PRD | Complexity | Description |
|-----|------------|-------------|
| [`todo-api.md`](../sample-prds/todo-api.md) | Simple | CRUD todos with auth and pagination |
| [`bookmark-manager.md`](../sample-prds/bookmark-manager.md) | Medium | Bookmarks with nested folders, tags, and search |
| [`beautician-scheduling.md`](../sample-prds/beautician-scheduling.md) | Medium | Multi-tenant appointment scheduling |
| [`bjj-open-mat-finder.md`](../sample-prds/bjj-open-mat-finder.md) | Complex | Geospatial search, Auth0, Google Places |

Here is a stripped-down version to illustrate the minimum viable PRD:

```markdown
# Notes API

## Overview
A simple notes API. Users register, log in, and manage personal notes.

## Data Models

### User
- id: UUID (auto-generated)
- email: string (unique, required)
- name: string (required)
- createdAt: datetime

### Note
- id: UUID (auto-generated)
- userId: UUID (foreign key to User)
- title: string (required, max 200 chars)
- body: string (optional)
- createdAt: datetime
- updatedAt: datetime

## Endpoints

### Auth
- POST /api/v1/auth/register - Register (email, name, password)
- POST /api/v1/auth/login - Login, returns JWT

### Notes (auth required)
- GET /api/v1/notes - List notes for authenticated user (pagination)
- POST /api/v1/notes - Create a note
- GET /api/v1/notes/:id - Get a note
- PUT /api/v1/notes/:id - Update a note
- DELETE /api/v1/notes/:id - Delete a note

## Business Rules
- Users can only access their own notes
- Pagination: page=1, limit=20, max 100

## Non-Functional
- Health check at GET /healthz
```

Save this as `my-notes-prd.md` in the project root.

## Step 5: Run the Agent

```bash
# Interactive — prompts for diagrams, UI, and IaC
bun run src/index.mts --prd my-notes-prd.md

# Fully non-interactive (good for CI or background runs)
bun run src/index.mts --prd my-notes-prd.md --no-diagrams --no-ui --no-iac

# Or try a sample PRD
bun run src/index.mts --prd sample-prds/todo-api.md
```

The pipeline verifies your LLM provider is reachable before doing any work. If Ollama isn't running or your API key is missing, you'll get a clear error with setup instructions.

This kicks off the full pipeline. You will see log output for each phase:

```
[info] PRD loaded from /path/to/my-notes-prd.md (812 chars)
[info] Config: maxIterations=5, concurrency=4
[info] LLM provider: openai
[info] Phase 1: Planning - generating task graph from PRD
```

The planning agent produces a task graph. You will see each task listed:

```
[info] Planning complete: 6 tasks generated in 5200ms (model: gpt-5.4)
[info]   [plan] Task: setup-foundation - "Project setup" (depends: [])
[info]   [plan] Task: model-user - "User schema" (depends: [setup-foundation])
[info]   [plan] Task: model-note - "Note schema" (depends: [setup-foundation])
[info]   [plan] Task: middleware-auth - "JWT auth" (depends: [model-user])
[info]   [plan] Task: endpoint-auth - "Auth routes" (depends: [model-user, middleware-auth])
[info]   [plan] Task: endpoint-notes - "Notes routes" (depends: [model-note, middleware-auth])
```

Then the code generation and testing phase runs. Each task goes through the codegen -> lint -> test loop:

```
[info] Phase 2: Executing task graph
[info]   [executor] Ready: setup-foundation
[info]   [codegen] Trying model: gpt-5.4
[info]   [codegen] Success with model gpt-5.4 (3100ms)
[info]   [qa] setup-foundation: unit PASS
[info]   [executor] Completed: setup-foundation (1 iteration)
[info]   [executor] Ready: model-user, model-note
```

If a test fails, the agent retries with error context:

```
[info]   [codegen] Trying model: gpt-5.4 (fix attempt 2/5)
[warn]   [qa] endpoint-auth: unit FAIL - 2 errors
[info]   [codegen] Trying model: gpt-5.4 (fix attempt 3/5)
[info]   [qa] endpoint-auth: unit PASS
[info]   [executor] Completed: endpoint-auth (3 iterations)
```

Finally, the assembly, scaffolding, devcontainer, and documentation phases run:

```
[info] Phase 2.25: Assembly - wiring endpoint plugins into index.mts
[info]   [assembly] Found plugin: authRoutes in src/routes/auth.mts
[info]   [assembly] Found plugin: noteRoutes in src/routes/notes.mts
[info]   [assembly] Assembled index.mts with 2 plugin(s)

[info] Phase 2.3: Project scaffolding
[info]   [scaffold] Wrote package.json
[info]   [scaffold] Wrote tsconfig.json
[info]   [scaffold] Wrote .env.example
[info]   [scaffold] Wrote README.md

[info] Phase 2.35: DevContainer setup
[info]   [devcontainer] Detected stack: bun@1.3.12, db=mongodb, port=3000
[info]   [devcontainer] Wrote devcontainer.json
[info]   [devcontainer] Wrote docker-compose.yml
[info]   [devcontainer] Wrote Dockerfile
[info]   [devcontainer] Wrote .env

[info] Phase 3: Generating documentation
[info] Documentation generated successfully

[info] === Pipeline Results ===
[info] Run ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
[info] Duration: 185000ms
[info] Documentation: generated
[info] Tasks: 6 completed, 0 failed, 0 skipped
[info]   [OK] setup-foundation (1 iterations)
[info]   [OK] model-user (1 iterations)
[info]   [OK] model-note (1 iterations)
[info]   [OK] middleware-auth (2 iterations)
[info]   [OK] endpoint-auth (3 iterations)
[info]   [OK] endpoint-notes (2 iterations)
[info] Workspace: .workspace/f47ac10b-58cc-4372-a567-0e02b2c3d479/
```

## Step 6: Inspect the Output

Your generated API lives in the workspace directory. The key files:

```bash
# The assembled entry point with all routes wired
cat .workspace/<run-id>/docs/assembled-index.mts

# The task plan
cat .workspace/<run-id>/plan.json

# Individual task code
ls .workspace/<run-id>/tasks/endpoint-notes/code/src/

# Execution summary
cat .workspace/<run-id>/execution-summary.json
```

The `docs/assembled-index.mts` file is the runnable Elysia app. It imports all generated endpoint plugins and mounts them with `.use()`.

## Step 7: Run the Generated API

The generated project at `.workspace/<run-id>/output/` is ready to run:

```bash
cd .workspace/<run-id>/output

# Install dependencies
bun install

# Start MongoDB (or use the devcontainer — see below)
docker run -d --name notes-mongo -p 27017:27017 mongo:latest

# Run the server
bun run dev
```

### Using the DevContainer (zero-setup)

The generated project includes a `.devcontainer/` directory. Open it in VS Code with the Dev Containers extension and everything starts automatically — MongoDB, env vars, and dependencies:

```bash
# Or start manually with Docker Compose
cd .workspace/<run-id>/output/.devcontainer
docker compose up -d
```

Default credentials are `admin:admin`, overridable via environment:

```bash
MONGO_USER=myuser MONGO_PASS=mypass docker compose up -d
```

The API will be available at `http://localhost:3000`. Test it:

```bash
# Health check
curl http://localhost:3000/healthz

# Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "name": "Test User", "password": "secret123"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'
# Returns: { "data": { "token": "eyJ..." } }

# Create a note (use the token from login)
curl -X POST http://localhost:3000/api/v1/notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{"title": "My first note", "body": "Hello world"}'

# List notes
curl http://localhost:3000/api/v1/notes \
  -H "Authorization: Bearer eyJ..."
```

## Step 8: Import the Hoppscotch Collection (optional)

The agent generates a Hoppscotch collection at `.workspace/<run-id>/docs/hoppscotch-collection.json`. To use it:

1. Open [Hoppscotch](https://hoppscotch.io)
2. Click **Import** in the collections sidebar
3. Select the `hoppscotch-collection.json` file
4. All endpoints are pre-configured with request bodies and headers

## Tuning Tips

### Faster Runs

Reduce iterations and concurrency if you want a quick prototype:

```bash
bun run src/index.mts my-prd.md 2 5
#                                ^ ^
#                                | max 5 tasks
#                                max 2 fix iterations
```

### More Reliable Runs

Increase iterations for complex PRDs:

```bash
MAX_FIX_ITERATIONS=10 bun run src/index.mts beautician-scheduling-prd.md
```

### Debugging Failures

If a task fails, check its artifacts:

```bash
# See what errors the QA agent found
cat .workspace/<run-id>/tasks/<task-id>/qa-results.json

# See the accumulated knowledge (what was tried)
cat .workspace/<run-id>/tasks/<task-id>/qa-knowledge.md

# See code from each iteration
ls .workspace/<run-id>/tasks/<task-id>/iterations/
```

### Re-running Without Re-planning

If you change only pipeline settings (not the PRD), the cached plan is reused automatically. To force a fresh plan:

```bash
rm -rf .workspace/.plan-cache/
```

## Example PRDs

See [`sample-prds/`](../sample-prds/) for ready-to-use examples:

| PRD | Complexity | Entities | Endpoints | Description |
|---|---|---|---|---|
| [`todo-api.md`](../sample-prds/todo-api.md) | Simple | 2 (User, Todo) | 9 | Classic todo app with priorities and pagination |
| [`bookmark-manager.md`](../sample-prds/bookmark-manager.md) | Medium | 3 (User, Folder, Bookmark) | 14 | Bookmark manager with folders, tags, and search |
| [`beautician-scheduling.md`](../sample-prds/beautician-scheduling.md) | Complex | 6 (Tenant, Customer, Service, etc.) | 20+ | Multi-tenant appointment scheduling |
| [`bjj-open-mat-finder.md`](../sample-prds/bjj-open-mat-finder.md) | Complex | 5 (User, Gym, OpenMat, CheckIn, Favorite) | 25+ | Geospatial search, Auth0, Google Places |

Start with the todo API if this is your first time:

```bash
bun run src/index.mts --prd sample-prds/todo-api.md
```
