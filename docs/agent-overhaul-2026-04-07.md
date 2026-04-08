# Agent Architecture Overhaul Plan — 2026-04-07

## Phase A: Critical

### Change 1: Planning Prompt — Independent Task Structure
- **`src/prompts/planning.mts`**: Rewrote system prompt to enforce `setup-foundation` as the single root task with `dependsOn=[]`. Added strict dependency chain rules (model -> repo -> service -> endpoint), max depth 4, and `filePaths` array requirement per task.
- **`src/agents/planning-agent.mts`**: Added post-validation check verifying exactly one root task exists and warning if its id is not `setup-foundation`.

### Change 2: Codegen Prompt — Only setup generates index.mts
- **`src/prompts/codegen-system-prompt.mts`**: Replaced "Entry File (REQUIRED)" section with per-task-type rules. Only `setup` tasks generate `src/index.mts`. Endpoint tasks export Elysia plugins. Model/repo/service tasks export classes/functions/types only.

### Change 3: Pass taskType through codegen chain
- **`src/agents/codegen-agent.mts`**: Added `taskType?: string` to `CodegenInput` interface and passed it to prompt functions.
- **`src/prompts/create-codegen-user-prompt.mts`**: Added `taskType` parameter with conditional instructions about index.mts and plugin exports.
- **`src/prompts/create-fix-prompt.mts`**: Added `taskType` parameter with same conditional instructions.
- **`src/orchestrator/fix-loop.mts`**: Passes `task.type` into `codegenInput.taskType` and into both user prompt calls.

## Phase B: Eliminate Cascade Failures

### Change 4: Per-task QA knowledge
- **`src/io/workspace.mts`**: Added `taskQaKnowledgePath(taskId)` returning `tasks/{taskId}/qa-knowledge.md`.
- **`src/orchestrator/fix-loop.mts`**: Changed `workspace.qaKnowledgePath()` to `workspace.taskQaKnowledgePath(task.id)`.

### Change 5: Allow dependents of failed tasks to proceed
- **`src/graph/get-ready-tasks.mts`**: Tasks can now proceed when deps are `completed` OR `failed`, except when `setup-foundation` fails (blocks all dependents).
- **`src/graph/get-skipped-tasks.mts`**: Only skips tasks when `setup-foundation` is among failed deps, not any failed dep.

## Phase C: Polish

### Change 6: QA prompts adapt per task type
- **`src/prompts/qa.mts`**: Added `getTaskTypeTestInstructions()` helper and `taskType` parameter to `createQaUserPrompt`. setup=app.handle(), model/repo/service=pure unit tests, endpoint=mount plugin on test Elysia instance.
- **`src/agents/qa-agent.mts`**: Added `taskType?: string` to `QaInput`, destructured it, and passed to `createQaUserPrompt`.
- **`src/orchestrator/fix-loop.mts`**: Passes `task.type` to QA input payload.

### Change 7: Assembly step
- **`src/orchestrator/pipeline.mts`**: Added Phase 2.25 assembly step after task execution. Reads setup-foundation's index.mts, finds completed endpoint tasks, scans for `new Elysia(` exports, generates import lines and `.use()` calls, writes assembled index.mts to workspace docs dir.

## Verification
- `bunx tsc --noEmit` passes with zero errors
- `bun test tests/parse-test-file.test.mts` passes all 21 tests
