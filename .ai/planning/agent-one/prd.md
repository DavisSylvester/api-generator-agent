# PRD: agent-one Elysia API Code Generator
**Feature Slug**: agent-one

## Overview
Update and extend the existing api-generator agent pipeline to generate Elysia APIs conforming to the architecture defined in davis.prd.md: Zod validation, ULID IDs, `getContainer()` DI, feature-based folder structure, `/v1` route prefixes, `@elysiajs/openapi`, Winston logging, BaseRepository, Docker MongoDB integration tests, and Playwright swagger verification.

## Goals
- Update the codegen system prompt to produce code matching the PRD-specified architecture
- Update the planning prompt to decompose PRDs into feature-based tasks matching the PRD folder structure
- Add state management (features.json) and session handoff document generation
- Add Playwright-based swagger screenshot verification to the pipeline
- Ensure the fix loop and QA agent work with the new Zod-based generated code conventions
- Add `docker-compose.yml` generation to generated projects
- Update the `MAX_FIX_ITERATIONS` env default and ensure the pipeline accepts the `--max-iterations` argument (30 as specified)

## Technical Approach
The existing pipeline infrastructure (agents, fix loop, parallel executor) is sound. The core changes are:
1. Replace the TypeBox-based codegen system prompt with a Zod-based one matching the PRD conventions
2. Update the planning system prompt to emit feature-based folder tasks
3. Add `src/prompts/codegen-system-prompt-v2.mts` with the new conventions and wire it in
4. Add `src/state/features-store.mts` for features.json state management
5. Add `src/state/session-store.mts` for session handoff docs
6. Add `src/verification/playwright-gate.mts` for swagger screenshot
7. Update `src/config/env.mts` to set `MAX_FIX_ITERATIONS` default to 5 (pipeline already supports --max-iterations arg)
8. Update `src/orchestrator/pipeline.mts` to write features.json and session handoff doc

Key files to modify:
- `src/prompts/codegen-system-prompt.mts` — replace TypeBox with Zod, update routes/structure
- `src/prompts/planning.mts` — update to feature-based folder structure
- `src/prompts/create-codegen-user-prompt.mts` — review and update
- `src/prompts/create-fix-prompt.mts` — review and update
- `src/config/env.mts` — already correct
- `src/orchestrator/pipeline.mts` — add features.json writes and session handoff

## Tasks
- [ ] **TASK-001**: Update codegen system prompt to Zod + PRD architecture
  - **Description**: Replace the TypeBox-based `CODEGEN_SYSTEM_PROMPT` in `src/prompts/codegen-system-prompt.mts` with a new prompt that generates: Zod schemas (not TypeBox), ULID IDs (via `ulid` package), `getContainer()` DI pattern, feature-based folder structure (`features/{domain}/`), `/v1` route prefixes (not `/api/v1`), `@elysiajs/openapi` (not `@elysiajs/swagger`), Winston logger injection, BaseRepository pattern with `ensureIndexes()`, standardized response format `{ success, data, count }`, and trace plugin with ULID traceId. Preserve all the async/await rules, import rules, test file rules, and error handling patterns already in the prompt. The new prompt must also document the `getContainer()` pattern, how to generate env config as a Zod schema singleton, and how to generate docker-compose.yml. Update the route prefix guidance from `/api/v1` to `/v1`.
  - **Acceptance**: The new system prompt exports `CODEGEN_SYSTEM_PROMPT` from `src/prompts/codegen-system-prompt.mts`. The prompt contains: "Zod" for validation, "ulid" for IDs, "getContainer" for DI, "/v1" for routes, "@elysiajs/openapi" for docs, "Winston" for logging, "BaseRepository" for repos, "ensureIndexes" for MongoDB indexes. All existing tests in `tests/` still pass. TypeScript compiles cleanly (`bun run tsc --noEmit`).
  - **Test Command**: `bun run tsc --noEmit && grep -c "getContainer\|ulid\|/v1\|@elysiajs/openapi\|BaseRepository\|ensureIndexes" /c/projects/agents/api-generator/src/prompts/codegen-system-prompt.mts`

- [ ] **TASK-002**: Update planning system prompt to feature-based folder structure
  - **Description**: Update `PLANNING_SYSTEM_PROMPT` in `src/prompts/planning.mts` to decompose PRDs into tasks that produce files in the feature-based folder structure: `features/{domain}/interfaces/`, `features/{domain}/validation/`, `features/{domain}/repository/`, `features/{domain}/service/`, `features/{domain}/docs/`. Update task type descriptions to match the PRD architecture. Update the `setup-foundation` task description to generate: `src/index.mts` (Elysia app with openapi + cors + trace plugin), `src/env.mts` (Zod-validated env singleton), `src/ioc/get-container.mts`, `src/loggers/logger.mts` (Winston), `docker-compose.yml`. Update the route convention to `/v1` (not `/api/v1`). Update dependency rules to reflect the feature-folder structure. Preserve all existing DAG structure rules (single root, dependency ordering).
  - **Acceptance**: `src/prompts/planning.mts` contains references to `features/{domain}`, `getContainer`, `/v1`, `@elysiajs/openapi`, `Zod`, `ensureIndexes`, `docker-compose`. TypeScript compiles cleanly.
  - **Test Command**: `bun run tsc --noEmit && grep -c "features/\|getContainer\|/v1\|@elysiajs/openapi\|ensureIndexes\|docker-compose" /c/projects/agents/api-generator/src/prompts/planning.mts`

- [ ] **TASK-003**: Add features.json state store
  - **Description**: Create `src/state/features-store.mts` that reads and writes a `features.json` file tracking generation state per feature. Interface: `IFeatureState { id, name, status: 'pending'|'in-progress'|'complete'|'failed', startedAt?, completedAt?, iteration, lastError? }`. Export `FeaturesStore` class with methods: `init(runId, features)`, `markInProgress(id)`, `markComplete(id, iteration)`, `markFailed(id, iteration, error)`, `getAll()`, `getByStatus(status)`. The store writes to `{workspaceRoot}/{runId}/features.json`. Create `src/state/index.mts` barrel. Write unit tests in `tests/state/features-store.test.mts`.
  - **Acceptance**: `tests/state/features-store.test.mts` passes via `bun test`. TypeScript compiles cleanly. `src/state/features-store.mts` exports `FeaturesStore`. `src/state/index.mts` barrel exports it.
  - **Test Command**: `bun test tests/state/features-store.test.mts`

- [ ] **TASK-004**: Add session handoff document generator
  - **Description**: Create `src/state/session-store.mts` that generates a session handoff markdown document at the end of a pipeline run. The document includes: run ID, timestamp, PRD name, task summary table (ID, status, iterations), list of failed tasks with last errors, list of files generated (from workspace), next steps. Export `SessionStore` class with method `generateHandoff(runId, taskStates, workspaceRoot): Promise<string>` that returns the markdown string and writes it to `{workspaceRoot}/{runId}/SESSION-HANDOFF.md`. Integrate into `src/orchestrator/pipeline.mts` by calling `generateHandoff` at the end of the pipeline and logging the path.
  - **Acceptance**: `src/state/session-store.mts` exports `SessionStore`. `src/orchestrator/pipeline.mts` imports and calls `generateHandoff`. TypeScript compiles cleanly. `bun test tests/state/session-store.test.mts` passes.
  - **Test Command**: `bun test tests/state/session-store.test.mts && bun run tsc --noEmit`

- [ ] **TASK-005**: Update codegen user prompt and fix prompt for new conventions
  - **Description**: Update `src/prompts/create-codegen-user-prompt.mts` and `src/prompts/create-fix-prompt.mts` to reference the updated architecture. The user prompt should mention Zod, ULID, `getContainer()`, and the feature-folder structure when providing task context. The fix prompt should include guidance on fixing Zod schema errors (not TypeBox errors). Also update `src/agents/codegen-agent.mts` `sanitizeCodeFiles` to handle Zod-based patterns: remove any mongoose imports, handle `ulid` import normalization, ensure Zod import paths are correct. Add a filter to block `mongoose` in `src/agents/qa-agent.mts` `BLOCKED_PACKAGES`.
  - **Acceptance**: TypeScript compiles cleanly. `bun test` on existing tests still passes. `src/prompts/create-codegen-user-prompt.mts` references Zod/ULID conventions. `mongoose` is in `BLOCKED_PACKAGES` in qa-agent.
  - **Test Command**: `bun run tsc --noEmit && grep "mongoose" /c/projects/agents/api-generator/src/agents/qa-agent.mts`

- [ ] **TASK-006**: Update pipeline to write features.json and integrate state management
  - **Description**: Update `src/orchestrator/pipeline.mts` to: (1) create a `FeaturesStore` instance and initialize it with the task graph before execution, (2) call `markInProgress` before each task, `markComplete` or `markFailed` after each task, (3) call `SessionStore.generateHandoff` at the end and log the handoff path, (4) write the features.json path to the pipeline result. Import `FeaturesStore` from `src/state/index.mts` and `SessionStore` from `src/state/index.mts`. Also update `src/types/pipeline.mts` (or wherever `PipelineResult` is defined) to include `featuresJsonPath` and `sessionHandoffPath` in the result type.
  - **Acceptance**: TypeScript compiles cleanly. `src/orchestrator/pipeline.mts` imports and uses `FeaturesStore` and `SessionStore`. The pipeline result includes `sessionHandoffPath`. No existing tests broken.
  - **Test Command**: `bun run tsc --noEmit`

- [ ] **TASK-007**: Add Playwright swagger screenshot verification gate
  - **Description**: Create `src/verification/playwright-gate.mts` that: (1) starts an Elysia server from generated code, (2) uses Playwright to navigate to `/swagger`, (3) takes a screenshot and saves it to `.docs/swagger-verification.png`, (4) verifies the page title contains the API name, (5) returns a result indicating pass/fail with the screenshot path. Export `runPlaywrightGate(codeFiles, codeDir, port, apiName, outputDir): Promise<Result<{ screenshotPath }, Error>>`. Also create `src/verification/index.mts` barrel. Write unit tests in `tests/verification/playwright-gate.test.mts` (mock the playwright calls). Integrate the gate as an optional step in `src/orchestrator/pipeline.mts` — run it after Phase 2 (task execution) if `PLAYWRIGHT_VERIFICATION=true` env var is set. Add `PLAYWRIGHT_VERIFICATION` boolean env var to `src/config/env.mts`.
  - **Acceptance**: `src/verification/playwright-gate.mts` exports `runPlaywrightGate`. `src/config/env.mts` has `PLAYWRIGHT_VERIFICATION` field. TypeScript compiles cleanly. `bun test tests/verification/playwright-gate.test.mts` passes.
  - **Test Command**: `bun test tests/verification/playwright-gate.test.mts && bun run tsc --noEmit`

- [ ] **TASK-008**: Update env config, add ULID to QA baseline packages, and final integration
  - **Description**: (1) Update `src/config/env.mts`: add `PLAYWRIGHT_VERIFICATION: z.coerce.boolean().default(false)`. (2) In `src/agents/qa-agent.mts`, add `ulid` to the baseline packages installed alongside `elysia`, `mongodb` etc. (3) Update `src/agents/codegen-agent.mts` `sanitizeCodeFiles` to NOT filter out `env.mts` files generated under `src/` (the PRD requires generating env.mts as a Zod singleton). Add a new env-file preservation rule: only filter out `env.mts` if it's NOT in `src/` path. (4) In `src/prompts/planning.mts` update the `setup-foundation` description to require generating `src/env.mts`. (5) Run full lint pass and fix any issues introduced by the changes across all tasks.
  - **Acceptance**: TypeScript compiles cleanly with zero errors. `bun test` passes all existing tests. `src/config/env.mts` has `PLAYWRIGHT_VERIFICATION`. `ulid` is in the QA baseline packages. `sanitizeCodeFiles` no longer strips `src/env.mts`. ESLint passes with zero errors.
  - **Test Command**: `bun run tsc --noEmit && bun test`

## Acceptance Criteria
- All 8 tasks pass their test commands
- `bun run tsc --noEmit` exits 0 across all source files
- The codegen system prompt generates code matching davis.prd.md conventions (Zod, ULID, `getContainer()`, `/v1` routes, `@elysiajs/openapi`, Winston, BaseRepository, feature-folder structure)
- The pipeline writes features.json and SESSION-HANDOFF.md at the end of every run
- All existing tests continue to pass

## Out of Scope
- Actually running the pipeline against a sample PRD (that would require live LLM calls)
- Generating the Angular UI
- Azure Terraform / AWS CDK addon templates
- CLI mode (the pipeline is already invocable via `bun run src/index.mts <prd-file>`)
- Playwright visual verification end-to-end (only the gate module is built, integration requires Docker)
