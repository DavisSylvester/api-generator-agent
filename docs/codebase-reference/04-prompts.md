# src/prompts/ -- LLM Prompt System

The prompt system uses a two-layer architecture: TypeScript files (`.mts`) handle loading and dynamic assembly, while markdown files (`.md`) contain the raw prompt text. This keeps prompts human-editable while providing typed interfaces for the orchestration layer.

---

## TypeScript Prompt Files

### codegen-system-prompt.mts
**Exports:** `CODEGEN_SYSTEM_PROMPT`
**What it does:** Reads `src/prompts/md/codegen-system.md` at module load time and exports it as a constant string.
**Why:** Separates disk I/O from prompt content.

### codegen.mts
**Exports:** Re-exports `CODEGEN_SYSTEM_PROMPT`, `createCodegenUserPrompt`, `createFixPrompt`
**What it does:** Barrel file for all code-generation prompt utilities.
**Why:** Single import point for codegen orchestrator.

### create-codegen-user-prompt.mts
**Exports:** `createCodegenUserPrompt()`
**What it does:** Builds dynamic user prompts for code generation. At load time, reads six markdown files from `codegen-tests/` into a `CODEGEN_TEST_INSTRUCTIONS` record. The function:
- Announces task name and type
- Includes task description
- Warns non-setup tasks not to generate `src/index.mts`
- Includes dependency code with import instructions
- Appends task-type-specific test instructions
- Requests test files at `tests/{taskId}.test.mts`

**Why:** Centralizes complex prompt assembly with dependency code injection and task-type-specific testing guidance.

### create-fix-prompt.mts
**Exports:** `createFixPrompt()`
**What it does:** Builds user prompts for fixing errors in previously generated code:
- Extracts file paths from `// path` comment headers
- Lists paths explicitly to avoid double-`src/` prefix bugs
- Adds task-type restrictions
- Presents previous code and numbered error list
- Instructs LLM to fix only listed errors

**Why:** The fix loop needs structured error context and original code for targeted corrections.

### documentation.mts
**Exports:** `DOCUMENTATION_SYSTEM_PROMPT`, `createDocumentationUserPrompt()`
**What it does:** Loads documentation system prompt from markdown. User prompt wraps all generated code and asks for a Hoppscotch collection JSON.
**Why:** Automates API documentation generation.

### flutter-ui-system-prompt.mts
**Exports:** `FLUTTER_UI_SYSTEM_PROMPT`
**What it does:** Defines the Flutter UI code generation persona (inline, not from markdown). Specifies: Flutter + Dart 3.x, Riverpod, GoRouter, Dio, Auth0, Google Stitch 2026 design system, glassmorphism, dark mode, spring physics animations.
**Why:** Enables full-stack generation with a Flutter mobile frontend.

### flutter-ui-user-prompt.mts
**Exports:** `FlutterScreenTask`, `createFlutterUiUserPrompt()`
**What it does:** Builds per-screen prompts for Flutter generation. Includes screen name, role, API endpoints, API reference, truncated PRD context. Supports fix mode.
**Why:** Provides structured, screen-level prompt assembly for Flutter code generation.

### planning.mts
**Exports:** `PLANNING_SYSTEM_PROMPT`, `createPlanningUserPrompt()`
**What it does:** Loads planning system prompt from markdown. User prompt wraps PRD text and asks for JSON task breakdown.
**Why:** Transforms human-readable PRD into machine-executable task plan.

### prd-expansion.mts
**Exports:** `PRD_EXPANSION_SYSTEM_PROMPT`, `createPrdExpansionUserPrompt()`
**What it does:** Loads PRD expansion prompt from markdown. Wraps short user input and asks for full PRD.
**Why:** The first pipeline step -- user idea to structured PRD.

### qa-integration.mts
**Exports:** `QA_INTEGRATION_SYSTEM_PROMPT`, `createQaIntegrationUserPrompt()`
**What it does:** Loads integration test prompt from markdown. Builds prompt for generating Hoppscotch test collections with `<<BASE_URL>>` variable, assertions, and ID chaining.
**Why:** HTTP-level integration tests complementing unit tests.

### qa.mts
**Exports:** `QA_SYSTEM_PROMPT`, `createQaUserPrompt()`
**What it does:** Loads QA prompt from markdown plus five task-type-specific instruction files. Builds user prompt with code, knowledge, task-type instructions, and available exports list.
**Why:** Type-aware test generation (different patterns for models vs. endpoints vs. services).

---

## System Prompt Markdown Files (src/prompts/md/)

### codegen-system.md (466 lines)
**Contains:** Complete persona and rules for code generation. Key sections:
- Stack: BunJS, Elysia, strict TypeScript `.mts`, TypeBox, MongoDB native driver, `Bun.password`, `jose`, Winston
- TypeBox import rules (critical `@sinclair/typebox` vs `@sinclair/typebox/value` distinction)
- Environment: `process.env` directly, never `env.mts`, never `dotenv`
- Architecture: Controllers, Services, Repositories with DI, CORS mandatory
- Barrel file rules, async/await rules, import rules (never `import type`)
- Response format: `{ statusCode, message, date, source, data }` with `.onError()` handler
- Entry file rules by task type
- Test file rules: `bun:test`, dynamic `await import()`, `../code/` prefix, max 150 lines

### planning-system.md (59 lines)
**Contains:** Software architect persona for task decomposition. Defines task types (setup, model, repository, service, middleware, endpoint), dependency rules (9 mandatory), naming conventions.

### prd-expansion-system.md (116 lines)
**Contains:** Technical product manager persona. Required sections: Overview, Stack, Entities, Endpoints, Auth, Validation, Non-Functional Requirements, Assumptions. Expansion rules, forbidden patterns.

### qa-integration-system.md (64 lines)
**Contains:** QA engineer persona for Hoppscotch integration test generation. Collection format, test script API, rules for `<<BASE_URL>>`, grouping, ordering.

### qa-system.md (100 lines)
**Contains:** QA engineer persona for `bun:test` unit tests. Workspace layout rules, Elysia `.handle()` testing (never `fetch()`), standard response shape, import rules.

### documentation-system.md (40 lines)
**Contains:** Technical writer persona for Hoppscotch collection documentation (without test scripts).

---

## Codegen Test Instructions (src/prompts/md/codegen-tests/)

Task-type-specific test templates appended to codegen prompts:

| File | Task Type | Key Pattern |
|------|-----------|-------------|
| `setup.md` | setup | Tests health endpoint + 404 handler via `await import()` |
| `model.md` | model | Tests TypeBox `Value.Check()` -- do NOT test email regex |
| `repository.md` | repository | Real MongoDB, drop test DB, basic CRUD only |
| `service.md` | service | Real MongoDB + repo, DI wiring, never `.toContain()` on errors |
| `endpoint.md` | endpoint | Test Elysia app with `.use()` plugin, `.handle()`, MongoDB |
| `middleware.md` | middleware | Auth middleware tests: 401 without token, 200 with valid JWT |

---

## QA Test Instructions (src/prompts/md/qa-tests/)

Task-type-specific test guidance for the QA agent (independent from codegen):

| File | Task Type | Key Pattern |
|------|-----------|-------------|
| `setup.md` | setup | Test via `.handle()`, set env vars before imports |
| `model.md` | model | Deep TypeBox validation patterns, `Value.Check()`/`Value.Errors()`/`Value.Default()` |
| `repository.md` | repository | Real database tests, `bun:sqlite` import pattern |
| `service.md` | service | Pure unit tests with mock/stub repositories |
| `endpoint.md` | endpoint | Create test Elysia, mount plugin with `.use()`, test via `.handle()` |
