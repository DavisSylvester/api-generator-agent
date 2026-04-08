# Pipeline Overhaul Plan - 2026-04-07

## Overview

Six-part overhaul to the api-generator-agent pipeline improving code generation quality,
test isolation, debugging, and integration test flow.

---

## Change 1: Barrel File Rule in Codegen Prompt

**File:** `src/prompts/codegen-system-prompt.mts`

Added a "Barrel File Rule" section after Architecture Rules (before Async/Await Rules):
- Every directory with multiple `.mts` files MUST have an `index.mts` barrel
- All cross-directory imports MUST use the barrel, not direct file paths
- Intra-directory imports may reference the file directly
- Example: `export { UserService } from './user-service.mts'`

---

## Change 2: QA Agent Unit-Only Mode

**File:** `src/agents/qa-agent.mts`

- Added `testScope?: 'unit-only' | 'full'` to the `QaInput` interface
- In `execute()`, after running unit tests, checks `testScope`. If `'unit-only'`, skips integration
  tests and uses a placeholder `TestPhaseResult { passed: true, errors: [], output: 'Skipped (unit-only mode)' }`
- Still generates the Hoppscotch collection in `generate` mode even in unit-only
- Changed `runIntegrationTests` from `private` to `public` for post-task pipeline usage

---

## Change 3: Move Hoppscotch to Post-Task Pipeline Phase

**File:** `src/orchestrator/pipeline.mts`

After the execution summary write and BEFORE documentation, added "Phase 2.5: Integration Testing":
- Loops over completed tasks only
- For each: reads code files via `readAllCodeFiles`, builds `CodeFile` array,
  calls `deps.qaAgent.runIntegrationTests(codeFiles, codeDir, collectionPath, taskPort)`
- Checks if collection file exists before attempting (skips if absent)
- Writes `integration-results.json` to workspace root
- Logs pass/fail per task

**File:** `src/orchestrator/fix-loop.mts`

- Passes `testScope: 'unit-only'` in the QaInput payload
- Updated QA result logging to only show unit results

---

## Change 4: Prompt Iteration Logging

**File:** `src/orchestrator/fix-loop.mts`

- Imports `CODEGEN_SYSTEM_PROMPT`, `createCodegenUserPrompt`, and `createFixPrompt`
- Before calling `codegenAgent.run()`, constructs the user prompt locally to capture it
- After codegen returns successfully, writes `prompt-iteration-{N}.md` to the iteration dir with:
  - Task info (name, id, mode, timestamp, duration, model)
  - Issues being resolved (errors list or "Initial generation")
  - Full system prompt
  - User prompt (capped at 50,000 chars)
  - Codegen response summary (file count and paths with sizes)
  - QA knowledge applied

---

## Change 5: Verify Default Iterations

**File:** `src/config/env.mts`

Verified `MAX_FIX_ITERATIONS` defaults to 5. No change needed.

---

## Change 6: Structured QA Feedback

**File:** `src/orchestrator/fix-loop.mts`

When QA fails, enhanced the `lastErrors` collection:
- Prefixes each unit error with `Unit Error N:` for clarity
- Combines prefixed unit errors with integration errors
- The `prompt-iteration-{N}.md` captures everything for debugging

---

## Verification

- `bunx tsc --noEmit` passes
- `bun test tests/parse-test-file.test.mts` passes (21 tests, 0 failures)
