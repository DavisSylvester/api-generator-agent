# agent-one -- Product Requirements Document

> **Author:** Davis Sylvester
> **Created:** 2026-03-28
> **Status:** Draft
> **Version:** 0.1.0

---

## Progress Checklist

- [ ] Problem statement and goals defined
- [ ] User personas and workflows documented
- [ ] Functional requirements specified with MoSCoW priorities
- [ ] Technical architecture designed (agent-one internals)
- [ ] Non-functional requirements captured
- [ ] Milestones and phased delivery plan confirmed
- [ ] Phase 1 (Core Engine) implemented
- [ ] Phase 2 (PRD Workflow + State Management) implemented
- [ ] Phase 3 (Verification + Observability) implemented
- [ ] Phase 4 (Addons + Extensibility) implemented
- [ ] Phase 5 (CLI + Distribution) implemented

---

## 1. Problem Statement and Goals

### Problem

Building production-grade Elysia APIs on Bun requires significant boilerplate: layered architecture scaffolding, DI wiring, Zod validation schemas, repository/service/router plumbing, test scaffolding, Swagger docs, and infrastructure-as-code. Even with established patterns across multiple projects (cmms, utils, youtube-daily-digest, smartsheet-api, ct-ai-photo-qc), each new API means hours of copy-paste-adapt cycles that introduce drift from the canonical architecture.

Existing code generators (Yeoman, Hygen, plop) produce flat scaffolds without understanding the relationships between layers, and none of them enforce the specific conventions Davis has standardized across his enterprise projects. LLM-based coding assistants can generate code but lack the harness infrastructure for long-running, multi-file generation with verification gates, state persistence, and architectural consistency.

### Goals

| # | Goal | Measurable Outcome |
|---|------|--------------------|
| G1 | Eliminate boilerplate for new Elysia APIs | A complete CRUD feature (interfaces, schemas, repo, service, router, tests, docs) generated in under 2 minutes |
| G2 | Enforce architectural consistency | 100% of generated code passes ESLint, matches layered architecture pattern, and follows all coding conventions |
| G3 | Support long-running generation with reliability | Generation can be paused, resumed, and handed off across sessions without data loss |
| G4 | Maintain human oversight | Every generated feature pauses for review before proceeding; PRD approval gate before any code generation |
| G5 | Provide full observability into agent behavior | Every tool call, token spend, and iteration outcome is logged and queryable |
| G6 | Enable extensibility beyond CRUD | Pluggable addon templates for queues, timers, external API clients, and notifications |

### What agent-one Is Not

- **Not a general-purpose code generator.** It generates Elysia APIs on Bun with a specific architecture. Other frameworks and runtimes are out of scope.
- **Not an autonomous agent.** It operates with human-in-the-loop checkpoints. It does not deploy code or modify production systems.
- **Not a UI generator (yet).** Angular UI generation is a future phase and explicitly excluded from this PRD.

---

## 2. User Personas and Workflows

### Persona 1: Davis (Primary -- Solo Engineer)

| Attribute | Detail |
|-----------|--------|
| Role | Senior TypeScript/Bun engineer, enterprise API developer |
| Goal | Spin up new APIs in minutes instead of hours while maintaining his established patterns |
| Pain Points | Repetitive scaffolding, convention drift across projects, context loss when switching between projects |
| Technical Level | Expert -- wants full control, reviews all generated code, expects strict TypeScript |
| Interaction Mode | Claude Code custom agent (primary), standalone CLI (secondary) |

**Workflow A -- Natural Language Prompt:**
1. Davis invokes agent-one with a plain English description: "Generate a work order management API with CRUD, status transitions, and assignment tracking"
2. Agent-one parses the prompt, identifies features, and presents a generation plan
3. Davis approves or adjusts the plan
4. Agent-one generates bottom-up (interfaces -> schemas -> repo -> service -> router -> tests) per feature
5. After each feature, agent-one pauses for Davis to review
6. Davis approves, requests changes, or skips to next feature
7. Agent-one commits each completed feature with a conventional commit

**Workflow B -- PRD-First:**
1. Davis invokes agent-one in PRD mode
2. Agent-one interviews Davis (1-2 questions at a time) to gather requirements
3. Agent-one generates a PRD with checkboxes for each feature
4. Davis reviews and approves the PRD
5. Agent-one implements from the PRD, following the same bottom-up generation order
6. PRD checkboxes are updated as features complete

### Persona 2: Team Member (Future)

| Attribute | Detail |
|-----------|--------|
| Role | Junior/mid-level developer joining one of Davis's projects |
| Goal | Add new features to an existing API without breaking architectural conventions |
| Pain Points | Learning curve for the layered architecture, DI pattern, and file organization conventions |
| Technical Level | Intermediate -- knows TypeScript, less familiar with the specific patterns |
| Interaction Mode | CLI only |

**Workflow:**
1. Team member runs `agent-one generate feature --name "inventory-tracking"` inside an existing project
2. Agent-one detects the existing project structure and conventions
3. Agent-one generates the new feature following the established patterns
4. Team member reviews and commits

### Persona 3: Davis as Architect (Template Author)

| Attribute | Detail |
|-----------|--------|
| Role | Same person, different hat -- maintaining and extending agent-one's templates |
| Goal | Add new addon templates (e.g., queue consumer, timer job) without modifying core generation logic |
| Pain Points | Templates tightly coupled to generation engine, hard to test in isolation |
| Interaction Mode | Direct code editing of template files |

**Workflow:**
1. Davis creates a new addon template following the template contract
2. Davis registers it in the addon registry
3. Agent-one discovers and applies it when requested

---

## 3. Functional Requirements

### 3.1 Input Parsing and Planning

- [ ] **Must:** Accept natural language prompt describing an API and extract features, entities, and relationships
- [ ] **Must:** Accept a PRD document (markdown with checkboxes) as input and parse it into a generation plan
- [ ] **Must:** Support PRD-first workflow where agent-one interviews the user and generates the PRD
- [ ] **Should:** Detect ambiguity in prompts and ask clarifying questions before generating
- [ ] **Could:** Accept OpenAPI spec as input and generate implementation from it

### 3.2 Code Generation Engine

- [ ] **Must:** Generate complete feature sets in bottom-up order: interfaces -> Zod schemas -> repository -> service -> router -> tests
- [ ] **Must:** Generate .mts files with .mjs import specifiers throughout
- [ ] **Must:** Generate one interface per file with `i-` prefix and `I` prefix on interface names
- [ ] **Must:** Generate Zod schemas in validation/ folder with `z.infer<>` derived types in types/ folder
- [ ] **Must:** Generate repositories extending BaseRepository from @sylvesterllc/mongo with ensureIndexes() in init()
- [ ] **Must:** Generate services with constructor injection of repository interface and logger
- [ ] **Must:** Generate router factories as exported functions receiving (logger, service, config) returning new Elysia({ prefix })
- [ ] **Must:** Generate getContainer() IoC pattern returning { db, databaseConfig, repositories, services, helpers }
- [ ] **Must:** Generate Elysia server setup with cors + swagger + tracePlugin + apiRoutes composition
- [ ] **Must:** Configure Swagger at `/swagger` as the default documentation page — Elysia's openapi plugin serves the UI at this path. The root `/` must redirect or default to `/swagger`. Log the Swagger URL at server startup.
- [ ] **Must:** Never use `/api` as a route prefix. Routes start with `/v1` or `/v<version-number>` directly (e.g., `.group("/v1", ...)` not `.group("/api/v1", ...)`)
- [ ] **Must:** After smoke tests pass, use Playwright to navigate to `/swagger`, verify the page loads (title contains API name), take a screenshot, and save it to `.docs/swagger-verification.png`. Include the screenshot in the results documentation as proof of successful deployment.
- [ ] **Must:** Generate trace plugin with onRequest (ULID traceId), onAfterHandle (log response), onError (log error)
- [ ] **Must:** Generate env config as Zod schema validating Bun.env at startup, exported as singleton
- [ ] **Must:** Generate standardized response format: { success: true, data: [...], count: N } or { success: false, error: "message" }
- [ ] **Must:** Generate MongoDB connection with connection string from env, cached MongoClient singleton
- [ ] **Must:** Generate try-catch in routes with logger.error() and set.status
- [ ] **Must:** Generate try-catch in services with context logging
- [ ] **Must:** Use ULID for all entity IDs
- [ ] **Must:** Use Winston + TraceLogger for all logging (no console.log)
- [ ] **Must:** Generate feature-based folder structure: features/{domain}/interfaces, validation, repository, service, helpers, enums
- [ ] **Must:** Generate RepositoryFactory for DB-agnostic repository resolution (IRepository<D,T> + factory pattern)
- [ ] **Must:** Generate scoped package.json name (`@project/api`) for monorepo readiness
- [ ] **Must:** Generate libs/ folder with shared types/utils for future workspace extraction
- [ ] **Must:** Generate tsconfig path aliases (`@project/shared`) resolving locally, ready for Turborepo workspace resolution
- [ ] **Should:** Generate barrel files (index.mts) per folder with named exports
- [ ] **Should:** Support generating multiple features in a single run

### 3.3 Swagger and API Documentation

- [ ] **Must:** Generate Swagger detail objects (tags, summary, description, request/response schemas) in a separate docs/ folder per feature
- [ ] **Must:** Keep route files clean by importing/referencing swagger detail objects from the docs folder
- [ ] **Must:** Generate a standalone openapi.yaml spec file
- [ ] **Should:** Validate that generated openapi.yaml is spec-compliant

### 3.4 Test Generation

- [ ] **Must:** Generate test files alongside each feature using bun test (import { describe, it, expect } from 'bun:test')
- [ ] **Must:** Follow TDD approach: generate test stubs first, then implement to pass
- [ ] **Must:** Generate unit tests for services (mocked repositories)
- [ ] **Must:** Generate integration tests for every entity that hit real API endpoints via HTTP against Docker MongoDB — this is a hard rule, not optional. Each integration test must:
  - Start Docker MongoDB + Elysia server
  - Test full CRUD round-trip via fetch(): POST → GET → GET by ID → PUT → DELETE → verify deleted
  - Test cross-entity flows (e.g., create parent entity, then create child referencing it)
  - Test error cases: invalid body → 400, missing entity → 404, invalid foreign key → 400/404
  - Integration test files: `__tests__/{entity}.integration.test.mts`
- [ ] **Must:** Generate a docker-compose.yml with MongoDB service for smoke testing and integration tests
- [ ] **Could:** Generate test fixtures and factories for common entity patterns

### 3.5 State Management (Long-Running Generation)

- [ ] **Must:** Maintain a PRD with checkboxes that updates as features complete (planning phase tracker)
- [ ] **Must:** Maintain features.json with structured status tracking (pending, in-progress, complete, failed) and flags per feature
- [ ] **Must:** Commit to git after each completed feature with conventional commit messages
- [ ] **Must:** Implement verification gates: ESLint pass, test pass, and endpoint smoke test before marking a feature complete
- [ ] **Must:** Pause for human review at defined checkpoints (after PRD generation, after each feature completion)
- [ ] **Must:** Generate session handoff docs at end of session: state summary, blockers, next steps
- [ ] **Should:** Support resuming generation from features.json after a session interruption
- [ ] **Should:** Support rolling back a failed feature to the last good git commit

### 3.6 Execution Trace and Audit Log

- [ ] **Must:** Capture per-step trace data: tool uses (which tools, call count), token consumption, iteration result, errors encountered
- [ ] **Must:** Write trace data to local markdown files at `.docs/<step-name-iteration>.md`
- [ ] **Must:** Write trace data to a MongoDB collection for querying and long-term analysis
- [ ] **Should:** Provide a summary report at end of generation showing total tokens, time, errors, and features completed
- [ ] **Could:** Provide a CLI command to query past generation traces from MongoDB

### 3.7 Infrastructure Addon Templates

- [ ] **Should:** Provide Azure Terraform scaffolding addon (queue consumers, timer jobs, KeyVault, managed identity)
- [ ] **Should:** Provide AWS CDK scaffolding addon
- [ ] **Could:** Provide queue producer/consumer addon template
- [ ] **Could:** Provide external API client addon template
- [ ] **Could:** Provide Teams notification addon template
- [ ] **Could:** Provide scheduled/timer job addon template

### 3.8 Delivery Modes

- [ ] **Must:** Work as a Claude Code custom agent invocable via Claude Code's agent system
- [ ] **Must:** Work as a standalone Bun CLI: `agent-one generate <project-name>`
- [ ] **Must:** Share core logic between both delivery modes (single codebase)
- [ ] **Should:** Provide interactive mode in CLI with guided prompts
- [ ] **Could:** Provide a `--dry-run` flag that outputs the generation plan without writing files

### 3.9 Coding Convention Enforcement

- [ ] **Must:** Enforce strict TypeScript -- no `any` in any generated code
- [ ] **Must:** Use single quotes, trailing commas, arrow functions for callbacks in all generated code
- [ ] **Must:** Use kebab-case for file names, PascalCase for classes/interfaces, camelCase for variables/functions
- [ ] **Must:** Include blank line after class opening brace in all generated classes
- [ ] **Must:** Run `eslint --fix` on all generated TypeScript files after every generation step; remaining errors block feature completion
- [ ] **Must:** After every code change (new endpoints, modified schemas, updated business rules, changed interfaces), update all documentation to stay in sync: ui/memory.md (API reference for Angular), .docs/RESULTS.md (test results), TASKS.md (checkboxes), PRD.md (requirements), and Swagger detail objects. Stale documentation is a blocking defect.
- [ ] **Must:** Use named exports throughout (no default exports)
- [ ] **Must:** No method or function body may exceed 30 lines (excluding blank lines and comments). Extract helper functions if logic requires more.
- [ ] **Must:** Enforce `@typescript-eslint/no-explicit-any: error` — no `any` in generated code
- [ ] **Must:** Enforce `@typescript-eslint/explicit-function-return-type: error` — all functions have explicit return types
- [ ] **Must:** Enforce `@typescript-eslint/explicit-module-boundary-types: error`
- [ ] **Must:** Use double quotes for strings (`@stylistic/quotes: "double"`)
- [ ] **Must:** Generate ESLint flat config (eslint.config.mjs) based on ct-ai-photo-qc canonical config with @eslint/js, typescript-eslint, @stylistic, eslint-plugin-import, eslint-plugin-jsdoc
- [ ] **Must:** Always use latest stable versions of Elysia and all plugins. Use `@elysiajs/openapi` (NOT `@elysiajs/swagger` which is deprecated). Never use deprecated methods, APIs, or packages anywhere in generated code.
- [ ] **Must:** When unsure if an API/method is current, read the official documentation (https://elysiajs.com) before using it. If a deprecation warning appears in console or Playwright verification, immediately replace with the recommended alternative.
- [ ] **Won't:** Generate Angular UI components (deferred to future phase)
- [ ] **Won't:** Support runtimes other than Bun
- [ ] **Won't:** Support frameworks other than Elysia
- [ ] **Won't:** Support databases other than MongoDB as primary (extensibility designed in, not implemented)

---

## 4. Technical Architecture

This section describes how agent-one itself is built -- its internal structure, not the code it generates.

### 4.1 High-Level Architecture

```
+------------------------------------------------------------------+
|                        agent-one                                  |
|                                                                   |
|  +------------------+    +------------------+    +--------------+ |
|  |  Input Layer     |    |  Planning Layer  |    | Output Layer | |
|  |                  |--->|                  |--->|              | |
|  |  - Prompt Parser |    |  - Feature       |    | - File Writer| |
|  |  - PRD Parser    |    |    Extractor     |    | - Git Ops    | |
|  |  - CLI Args      |    |  - Dependency    |    | - Console    | |
|  |  - Agent Bridge  |    |    Resolver      |    |   Reporter   | |
|  +------------------+    |  - Generation    |    +--------------+ |
|                          |    Planner       |                     |
|                          +--------+---------+                     |
|                                   |                               |
|                          +--------v---------+                     |
|                          | Generation Engine|                     |
|                          |                  |                     |
|                          | - Template       |                     |
|                          |   Registry       |                     |
|                          | - Code Renderer  |                     |
|                          | - Verification   |                     |
|                          |   Pipeline       |                     |
|                          | - State Manager  |                     |
|                          | - Trace Logger   |                     |
|                          +------------------+                     |
+------------------------------------------------------------------+
```

### 4.2 Internal Stack

| Concern | Technology |
|---------|-----------|
| Runtime | Bun |
| Language | TypeScript strict (.mts / .mjs) |
| CLI Framework | Custom arg parser (zero deps, Bun-native) |
| Template Engine | Raw TypeScript template literals (.mts files exporting render functions) |
| LLM Integration | Anthropic SDK (Claude API) for prompt parsing, feature extraction, and PRD generation. No token budget limit. |
| State Storage | Local filesystem (features.json, .docs/) + MongoDB (trace collection) |
| Git Operations | simple-git (npm package) |
| Logging | Winston + TraceLogger (@sylvesterllc/utils) |
| Testing | bun test |
| Linting | ESLint (programmatic API for verification gates) |

### 4.3 Internal Module Structure

```
agent-one/
  src/
    index.mts                          # CLI entry point
    agent-bridge.mts                   # Claude Code custom agent entry point
    config/
      env.mts                          # Zod-validated env config
      index.mts
    core/
      interfaces/
        i-generation-plan.mts
        i-feature-spec.mts
        i-template.mts
        i-trace-entry.mts
        i-verification-result.mts
        index.mts
      types/
        generation-status.mts          # 'pending' | 'in-progress' | 'complete' | 'failed'
        index.mts
      enums/
        template-type.mts
        addon-type.mts
        index.mts
    input/
      prompt-parser.mts                # NL prompt -> feature specs
      prd-parser.mts                   # PRD markdown -> feature specs
      prd-interviewer.mts              # Interactive PRD generation
      cli.mts                          # Custom arg parser, CLI entry
    planning/
      feature-extractor.mts            # Identifies entities, relationships, operations
      dependency-resolver.mts          # Orders features by dependencies
      generation-planner.mts           # Creates ordered generation plan
    generation/
      engine.mts                       # Orchestrator: iterates plan, calls renderers
      template-registry.mts            # Discovers and manages templates
      renderers/
        interface-renderer.mts
        schema-renderer.mts
        repository-renderer.mts
        service-renderer.mts
        router-renderer.mts
        test-renderer.mts
        swagger-renderer.mts
        container-renderer.mts
        env-renderer.mts
        server-renderer.mts
        repository-factory-renderer.mts  # Renders RepositoryFactory for DB-agnostic resolution
        docker-compose-renderer.mts      # Renders docker-compose.yml for smoke tests
      templates/
        base/                          # CRUD base templates (raw TypeScript template literals)
        addons/
          azure-terraform/
          aws-cdk/
          queue-consumer/
          external-api-client/
          teams-notification/
          timer-job/
    verification/
      eslint-gate.mts                  # Programmatic ESLint check
      test-gate.mts                    # Run bun test, parse results
      smoke-gate.mts                   # Start server, hit endpoints, shut down
      pipeline.mts                     # Orchestrates all gates in sequence
    state/
      features-store.mts               # Read/write features.json
      prd-store.mts                    # Read/write PRD with checkbox updates
      session-store.mts                # Session handoff doc generation
    trace/
      trace-logger.mts                 # Per-step trace capture
      trace-writer-fs.mts              # Write .docs/<step>.md
      trace-writer-mongo.mts           # Write to MongoDB collection
    git/
      git-ops.mts                      # Commit, branch, rollback operations
    output/
      file-writer.mts                  # Write generated files to disk
      console-reporter.mts             # Progress and status output
  templates/
    base/
      interface.tmpl.mts
      schema.tmpl.mts
      repository.tmpl.mts
      service.tmpl.mts
      router.tmpl.mts
      test.tmpl.mts
      swagger-detail.tmpl.mts
      container.tmpl.mts
      env-config.tmpl.mts
      server.tmpl.mts
      openapi.tmpl.mts
      docker-compose.tmpl.mts
      package-json.tmpl.mts
      tsconfig.tmpl.mts
      env-example.tmpl.mts
      gitignore.tmpl.mts
      health-router.tmpl.mts
      version-router.tmpl.mts
      eslint-config.tmpl.mts
    addons/
      azure-terraform/
      aws-cdk/
  tests/
    input/
    planning/
    generation/
    verification/
    state/
    trace/
  docs/
    PRD.md
```

### 4.4 Generation Engine Flow

```
1. INPUT
   User provides prompt or PRD
        |
        v
2. PARSE
   Extract features, entities, relationships, operations
        |
        v
3. PLAN
   Order features by dependency, create generation plan
   Write features.json with all features as 'pending'
        |
        v
4. REVIEW GATE (Human)
   Present plan to user, wait for approval
        |
        v
5. GENERATE (per feature, bottom-up)
   For each feature in plan:
     a. Mark feature as 'in-progress' in features.json
     b. Render interfaces (one per file, barrel export)
     c. Render Zod schemas + derived types
     d. Render repository (extends BaseRepository)
     e. Render service (constructor injection)
     f. Render router factory (swagger refs in docs/)
     g. Render tests (TDD stubs first)
     h. Update getContainer() with new registrations
     i. Run `eslint --fix` on all generated/modified files
     j. Run verification pipeline:
        - ESLint pass (zero errors after --fix)
        - bun test pass
        - Endpoint smoke test pass
        - Playwright visual verification: navigate to /swagger, take screenshot, save to .docs/
     k. If verification fails:
        - Log errors to trace
        - Attempt auto-fix (up to 3 retries)
        - If still failing, mark as 'failed', pause for human intervention
     l. If verification passes:
        - Mark feature as 'complete' in features.json
        - Update PRD checkboxes
        - Git commit with conventional message
        - Log trace entry (tools, tokens, duration, outcome)
     m. REVIEW GATE (Human)
        - Present completed feature for review
        - User approves, requests changes, or skips
        |
        v
6. FINALIZE
   Generate openapi.yaml from all routes
   Generate session summary
   Final ESLint + test run across entire project
   Log final trace summary
```

### 4.5 Template Contract

Every template (base or addon) must implement the following interface:

```typescript
interface ITemplate {

  readonly name: string;
  readonly type: TemplateType; // 'base' | 'addon'
  readonly description: string;

  /** Files this template will generate, given a feature spec */
  plan(feature: IFeatureSpec): IGeneratedFile[];

  /** Render all files for the given feature */
  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[];

  /** Validate rendered output before writing */
  validate(files: IRenderedFile[]): IValidationResult;
}
```

### 4.6 Claude Code Agent Bridge

When invoked as a Claude Code custom agent, agent-one communicates through the agent protocol:

- Reads the user prompt from the agent invocation context
- Uses Claude Code's tool system for file operations (read, write, edit)
- Reports progress through Claude Code's output mechanism
- Human review checkpoints are natural pauses in the Claude Code conversation

When invoked as a standalone CLI, agent-one:

- Reads the user prompt from CLI arguments or interactive prompts
- Uses direct filesystem operations via Bun APIs
- Reports progress through console output
- Human review checkpoints use interactive terminal prompts (y/n/edit)

Both modes share the same core modules (planning, generation, verification, state, trace).

### 4.7 Generated Project Structure

Every generated project follows this structure (single-app, monorepo-ready):

```
<project-name>/
  package.json                        # Scoped name: @project/api, type: module
  tsconfig.json                       # Strict, path aliases: @project/shared -> libs/shared/src
  .env.example                        # All required env vars documented
  docker-compose.yml                  # MongoDB service for dev/testing
  src/
    index.mts                         # Entry point
    env.mts                           # Zod-validated Bun.env config singleton
    api/
      index.mts                       # Elysia app: cors + swagger + tracePlugin + routes
      plugins/
        trace.plugin.mts              # onRequest(ULID) + onAfterHandle + onError
      routes/
        health-router.mts
        version-router.mts
        index.mts                     # Barrel
    features/
      <domain>/                       # One folder per feature/domain
        interfaces/
          i-<entity>.mts              # One interface per file
          index.mts                   # Barrel with export type
        validation/
          <entity>.validation.mts     # Zod schema + z.infer<> type
          index.mts
        repository/
          <entity>-repository.mts     # extends BaseRepository, ensureIndexes()
          index.mts
        service/
          <entity>-service.mts        # Constructor(repo interface, logger)
          i-<entity>-service.mts      # Service interface
          index.mts
        helpers/                      # Optional domain helpers
        enums/                        # Optional domain enums
        docs/
          <entity>-swagger.mts        # Swagger detail objects (tags, summary, schemas)
    ioc/
      get-container.mts               # Returns IContainer { db, databaseConfig, repositories, services, helpers }
      create-database-configuration.mts
      repository-factory.mts          # DB-agnostic factory: IRepository<D,T> resolution by config
      interfaces/
        i-container.mts
    loggers/
      logger.mts                      # Winston + TraceLogger factory
    data/                             # Static data / seed data (optional)
  libs/
    shared/
      src/
        types/                        # Shared types across features
        index.mts                     # Barrel
  tests/
    <domain>/                         # Mirrors features/ structure
      <entity>-service.test.ts
  .docs/                              # Execution trace output (gitignored)
```

### 4.8 Session Resume Protocol

When resuming a generation session (after interruption or new context window):

```
1. VERIFY
   Check working directory exists and is a valid agent-one project
        |
        v
2. READ STATE
   Read features.json for current feature statuses
   Read .docs/ for latest trace entries
   Read git log for recent commits
        |
        v
3. ASSESS
   Identify last completed feature
   Identify any in-progress (interrupted) features
   Check if in-progress feature has partial files
        |
        v
4. RECOVER
   If in-progress feature has partial files:
     - Run verification pipeline on partial state
     - If passes: mark complete, commit
     - If fails: rollback to last git commit, re-mark as pending
        |
        v
5. BASELINE TEST
   Run ESLint + bun test on entire project
   Ensure existing features still pass
        |
        v
6. CONTINUE
   Resume generation from next pending feature in plan
```

### 4.9 Trace Entry Schema

Every generation step produces a trace entry conforming to this schema:

```typescript
interface ITraceEntry {

  readonly traceId: string;           // ULID
  readonly sessionId: string;         // ULID, shared across one generation run
  readonly featureName: string;       // e.g., "work-orders"
  readonly stepName: string;          // e.g., "render-repository"
  readonly iteration: number;         // 1-based, increments on retry

  readonly startedAt: string;         // ISO 8601
  readonly completedAt: string;       // ISO 8601
  readonly durationMs: number;

  readonly status: 'success' | 'failed' | 'skipped';

  readonly toolUses: IToolUse[];      // Which tools were called
  readonly tokenConsumption: {
    readonly prompt: number;
    readonly completion: number;
    readonly total: number;
  };

  readonly result: {
    readonly filesGenerated: string[];    // Paths of files written
    readonly filesModified: string[];     // Paths of files updated
    readonly linesOfCode: number;         // Total LOC generated/modified
    readonly summary: string;             // One-line outcome description
  };

  readonly errors: ITraceError[];     // Empty array if no errors

  readonly documentation: string;     // Full markdown documentation of what happened in this step
}

interface IToolUse {
  readonly toolName: string;
  readonly callCount: number;
  readonly totalDurationMs: number;
}

interface ITraceError {
  readonly message: string;
  readonly stack?: string;
  readonly file?: string;
  readonly line?: number;
  readonly context: Record<string, unknown>;
}
```

The `.docs/<step-name-iteration>.md` file renders this schema as human-readable markdown. The MongoDB collection stores the raw JSON.

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target |
|--------|--------|
| Single CRUD feature generation (6 files + tests) | < 30 seconds |
| Full API with 5 CRUD features + infrastructure | < 5 minutes |
| Verification pipeline per feature (lint + test + smoke) | < 15 seconds |
| CLI startup time | < 500ms |

### 5.2 Reliability

- Generation must be resumable after interruption (features.json tracks state)
- Failed features must not corrupt previously completed features
- Git commits after each feature provide rollback points
- Verification gates prevent broken code from being marked complete
- Auto-fix retries (up to 3) for common lint/test failures before escalating to human

### 5.3 Extensibility

- New addon templates can be added by implementing the ITemplate interface and registering in the template registry
- New renderers can be added without modifying the generation engine
- Template discovery is file-system based (drop a template folder, it gets discovered)
- Generation plan is data-driven (features.json), not hard-coded

### 5.4 Observability

- Every generation step produces a trace entry with tool calls, token usage, duration, and outcome
- Traces are dual-written: local markdown (.docs/) and MongoDB collection
- End-of-session summary aggregates all traces into a single report
- Errors include full context: step name, feature name, file being generated, error message, stack trace

### 5.5 Security

- No secrets in generated code; all sensitive values reference environment variables
- Generated env config validates presence of required env vars at startup
- MongoDB connection strings are never logged (redacted in trace output)
- Agent-one itself does not store or transmit user credentials

### 5.6 Compatibility

- Bun >= 1.0 (current stable)
- TypeScript >= 5.0 strict mode
- Node.js compatibility not required (Bun-only)
- Windows, macOS, and Linux support for CLI mode
- Claude Code integration requires Claude Code to be installed and configured

---

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Generation accuracy | 95% of generated features pass all verification gates on first attempt | Track pass/fail ratio in features.json across generation runs |
| Convention compliance | 100% of generated code passes ESLint with zero warnings | ESLint gate in verification pipeline; any failure blocks completion |
| Time savings | 80% reduction in time to scaffold a new API compared to manual creation | Benchmark: time a manual CRUD feature vs. agent-one generated feature |
| Architectural consistency | 100% of generated code matches the canonical layered architecture | Code review checklist comparison against reference projects |
| Session resilience | 100% of interrupted sessions can be resumed without data loss | Test by killing agent-one mid-generation and resuming |
| Trace completeness | 100% of generation steps have corresponding trace entries | Audit trace collection against features.json completed features |
| Template extensibility | New addon template can be created and integrated in < 1 hour | Time the process of adding a new addon from scratch |
| Developer satisfaction | Agent-one output requires < 10% manual modification before merging | Track lines changed post-generation vs. lines generated |

---

## 7. Timeline

### Phase 1 -- Core Engine (Weeks 1-3)

- [ ] Project scaffolding: Bun + TypeScript strict + ESLint + bun test setup
- [ ] Core interfaces and types (IFeatureSpec, ITemplate, IGenerationPlan, ITraceEntry)
- [ ] Env config with Zod validation
- [ ] Raw TypeScript template literal templates (.tmpl.mts)
- [ ] Base CRUD templates: interface, schema, repository, service, router, test, swagger-detail
- [ ] Renderers for all base templates
- [ ] File writer module
- [ ] Generation engine orchestrator (sequential feature generation)
- [ ] getContainer() renderer (updates DI container as features are added)
- [ ] Server setup renderer (cors, swagger, trace plugin, routes)
- [ ] openapi.yaml generator
- [ ] L1 template unit tests for all base templates (3 domain fixtures: Configuration, Registered Sheets, Photo Analysis)
- [ ] L2 renderer integration tests (full feature + multi-feature)
- [ ] L3 compilation tests (tsc --noEmit on generated output, all 3 domains)
- [ ] L4 lint tests (eslint --fix + eslint on generated output, all 3 domains)

### Phase 2 -- PRD Workflow and State Management (Weeks 4-5)

- [ ] Natural language prompt parser (feature extraction)
- [ ] PRD parser (markdown checkbox -> feature specs)
- [ ] PRD interviewer (interactive question flow)
- [ ] features.json state store (read, write, update status)
- [ ] PRD store (update checkboxes on completion)
- [ ] Session handoff document generator
- [ ] Generation planner (dependency resolution, ordering)
- [ ] Human review checkpoint integration (pause/approve/reject)

### Phase 3 -- Verification and Observability (Weeks 6-7)

- [ ] ESLint gate (programmatic API, auto-fix on failure)
- [ ] Test gate (run bun test, parse results, report failures)
- [ ] Smoke test gate (start server, hit generated endpoints, validate responses)
- [ ] Verification pipeline orchestrator (run gates in sequence, retry logic)
- [ ] Trace logger (capture tool calls, tokens, duration, outcome per step)
- [ ] Trace writer -- filesystem (.docs/ markdown files)
- [ ] Trace writer -- MongoDB collection
- [ ] End-of-session summary report generator
- [ ] Git operations (commit after feature, rollback on failure)

### Phase 4 -- Addons and Extensibility (Weeks 8-9)

- [ ] Template registry with filesystem-based discovery
- [ ] Template contract validation (ensure addons implement ITemplate)
- [ ] Azure Terraform addon template (queue consumers, timer jobs, KeyVault, managed identity)
- [ ] AWS CDK addon template
- [ ] Queue consumer addon template
- [ ] External API client addon template
- [ ] Teams notification addon template
- [ ] Timer/scheduled job addon template

### Phase 5 -- CLI and Distribution (Weeks 10-11)

- [ ] Custom CLI arg parser (generate, resume, status, trace commands)
- [ ] Interactive mode with guided prompts
- [ ] Claude Code custom agent bridge (agent-bridge.mts)
- [ ] Shared core between CLI and agent bridge
- [ ] --dry-run flag implementation
- [ ] End-to-end integration tests (full generation flow)
- [ ] Documentation: usage guide, template authoring guide, architecture overview
- [ ] npm package preparation and publish setup

---

## 8. Resolved Decisions (formerly Open Questions)

- [ ] **Template engine:** Raw TypeScript template literals. No external template engine dependency. Full TypeScript control, type-safe interpolation, and no extra build step. Templates live as `.mts` files exporting functions that return strings.
- [ ] **LLM dependency for prompt parsing:** LLM-based via Claude API (Anthropic SDK). No token budget constraint — optimize later based on trace data. Provides maximum flexibility for freeform NL prompts and feature extraction.
- [ ] **Monorepo readiness:** All three strategies combined: (1) scoped package.json name (`@project/api`), (2) libs/ folder for shared types/utils even in single-app mode, (3) tsconfig path aliases (`@project/shared`) that resolve locally now and to workspace packages later. Use best practices for Turborepo migration readiness.
- [ ] **CLI framework:** Custom arg parser. Zero external dependencies, full control over UX, lightweight. Bun-native approach.
- [ ] **Smoke test implementation:** Docker + real MongoDB via docker-compose. Most realistic testing. docker-compose.yml generated for multi-service setups. Requires Docker installed on dev machine.
- [ ] **Token budget:** No hard limit per generation run. Use whatever tokens are needed for quality output. Optimize later by analyzing trace data from actual runs.
- [ ] **Multi-database extensibility:** Dual approach: (1) `IRepository<D, T>` generic interface (current @sylvesterllc/mongo pattern) where D is the database client type, plus (2) `RepositoryFactory` that creates the right implementation based on config. Templates reference `IRepository` only, never MongoDB directly. This allows adding new DB backends by implementing the interface and registering in the factory — no template changes needed.
- [ ] **Agent-one's own DI:** Same `getContainer()` pattern that it generates. Dog-fooding the pattern proves it works and maintains consistency across all projects.

---

## Verification Checklist

- [ ] Overview complete
- [ ] User personas defined (3 personas with workflows)
- [ ] Features prioritized with MoSCoW (Must/Should/Could/Won't)
- [ ] Technical requirements captured (internal architecture, module structure, engine flow)
- [ ] Success metrics defined with targets and measurement methods
- [ ] Timeline with milestones confirmed (5 phases, 11 weeks)
