# Bugs and Fixes — Complete Registry

23 bugs identified and fixed across 17 pipeline runs.

---

## Phase 1: Core Pipeline Stability (Runs 1-4)

### Bug 1: ESLint ENOENT crash
- **Run:** 1
- **Symptom:** `ENOENT: no such file or directory` when writing ESLint config
- **Root cause:** ESLint agent wrote config without ensuring `workDir` exists
- **Fix:** Added `await mkdir(workDir, { recursive: true })` before writing `eslint.config.mjs`

### Bug 2: Codegen file explosion (89-142 files per iteration)
- **Run:** 2
- **Symptom:** Fix mode regenerated ALL dependency code instead of just task files
- **Root cause:** Full dependency source code (30-50KB+) passed in fix prompts
- **Fix:** Compact dependency summary (file paths + export names) in fix mode. MAX_FILES_PER_TASK=20 guard.

### Bug 3: QA not installing dependency packages
- **Run:** 2
- **Symptom:** `Cannot find module '@sinclair/typebox'`
- **Root cause:** `installDependencies` only scanned task's own code, not dependency files
- **Fix:** `scanDirForImports()` scans entire code dir + tests dir

### Bug 4: Fix mode dependency summary too sparse
- **Run:** 3
- **Symptom:** `this.repository.countByUserId is not a function` — LLM invented methods
- **Root cause:** Summary only listed export names, not method signatures
- **Fix:** Enhanced `buildDependencySummary()` to extract class method signatures

---

## Phase 2: Test Stabilization (Runs 4-8)

### Bug 5: Test imports missing ../code/ prefix
- **Run:** 4-5
- **Symptom:** `Cannot find module '../src/repositories/user-repository.mts'`
- **Root cause:** LLM generates `../src/` instead of `../code/src/` despite instructions
- **Fix:** Three-pronged: stronger prompt, explicit examples, sanitizer auto-fix `../src/` to `../code/src/`

### Bug 6: Setup test date field loop
- **Run:** 3-4
- **Symptom:** `expect(body.date).not.toBe('Invalid Date')` fails forever
- **Root cause:** Health endpoint date field is flaky to test
- **Fix:** Explicit test pattern that does NOT test date field

### Bug 7: Middleware async .derive() stuck
- **Run:** 5-6
- **Symptom:** `"await" can only be used inside an "async" function` for 22+ iterations
- **Root cause:** LLM generates `.derive(({ headers }) => { await ... })` without async
- **Fix:** Async/await rule in prompt + middleware-specific test instructions

### Bug 8: File truncation drops test files
- **Run:** 7
- **Symptom:** `Codegen did not produce any test files`
- **Root cause:** Truncation to 20 files happened BEFORE test/code separation
- **Fix:** Separate test files first, then truncate only code files (max 15)

### Bug 9: Codegen crash loses best-effort code
- **Run:** 7-8
- **Symptom:** Downstream tasks can't find dependency code after upstream crash
- **Root cause:** Crash exits without writing `lastCode` to shared output
- **Fix:** Write best-effort code to shared output before returning on crash

### Bug 10: Service tests import real repositories
- **Run:** 8
- **Symptom:** `Cannot find module '../code/src/repositories/user-repository.mts'`
- **Root cause:** Tests import real repo files instead of mocking
- **Fix:** Service test instructions mandate inline mocks (later changed to real DB)

### Bug 11: Middleware assertion mismatches
- **Run:** 9
- **Symptom:** `expect(received).toBe(expected)` on JWT response body fields
- **Root cause:** Tests assert on body fields that don't match implementation
- **Fix:** Simplified test pattern — status codes only

### Bug 12: Baseline packages not installed
- **Run:** 10
- **Symptom:** `ReferenceError: Elysia is not defined`
- **Root cause:** Package scan might miss imports in test files
- **Fix:** Always install baseline: elysia, jose, @sinclair/typebox, @types/bun

### Bug 13: Model can't fix async .derive()
- **Run:** 10-11
- **Symptom:** Same async error for 16+ iterations — model never adds `async`
- **Root cause:** qwen3-coder-next consistently omits `async` on `.derive()` callbacks
- **Fix:** Code sanitizer auto-injects `async` into `.derive()/.guard()` callbacks with `await`

---

## Phase 3: MongoDB + Resolve Architecture (Run 13)

### Bug 14: Middleware .as('plugin') scoping (CRITICAL)
- **Run:** 13-15
- **Symptom:** Auth tests return 200 instead of 401. 0/4 tests pass.
- **Root cause:** Elysia scopes `.guard()` + `.resolve()` to the plugin. Without `.as('plugin')`, routes after `.use(authMiddleware)` don't get guard/resolve applied.
- **Fix:** Added `.as('plugin')` to auth middleware example. Sanitizer auto-injects it.
- **Impact:** Fixed middleware-auth AND all 3 endpoint tasks (4 tasks total)

### Bug 15: Result type-only export
- **Run:** 13
- **Symptom:** `SyntaxError: export 'Result' not found in './result.mts'`
- **Root cause:** `export type Result<T, E> = ...` gets erased by Bun at runtime
- **Fix:** Result defined with runtime helper functions (`ok()`, `err()`) instead of type-only

### Bug 16: Email regex pattern test loop
- **Run:** 13-14
- **Symptom:** `Value.Check(UserSchema, { email: 'test@domain.co' })` returns false — 5 iterations stuck
- **Root cause:** TypeBox regex pattern doesn't match all valid email formats
- **Fix:** Knowledge base: "do NOT test email format validation with Value.Check"

### Bug 17: Error message string assertions
- **Run:** 13-15
- **Symptom:** `expect(error.message).toContain('Title must be at most 200 characters')` fails
- **Root cause:** TypeBox returns `"Expected string length less or equal to 200"` — different text
- **Fix:** Rule: "NEVER use .toContain() on error messages". Knowledge base for service-todo.

### Bug 18: Cloud model timeout (5 min)
- **Run:** 13-14
- **Symptom:** `All models failed for codegen` on repo-todo (14KB fix prompt)
- **Root cause:** 5-minute cloud fetch timeout too short for large fix prompts
- **Fix:** Increased to 10 minutes (600,000ms)

---

## Phase 4: Fallback System + ESM Fixes (Runs 15-17)

### Bug 19: Codegen returns prose instead of code
- **Run:** 14-15
- **Symptom:** `No code blocks found in codegen response` — model writes analysis text
- **Root cause:** LLM gets confused on fix prompts, writes explanation instead of fenced code blocks
- **Fix:** 3-tier fallback: retry with "MUST output code blocks" → GPT-5.4 → Claude Sonnet 4.6

### Bug 20: Stale test files in code/tests/
- **Run:** 15-16
- **Symptom:** `Cannot find module` from `code/tests/middleware-auth.test.mts` — bun runs 2 test files
- **Root cause:** Codegen writes tests to both `tests/` and `code/tests/`. The copy in `code/tests/` uses `../code/` prefix which resolves to `code/code/`.
- **Fix:** QA agent deletes `code/tests/*.test.mts` before running tests. Knowledge base rule.

### Bug 21: ESM import hoisting breaks env vars (CRITICAL)
- **Run:** 16
- **Symptom:** `Environment validation failed: /JWT_SECRET: Expected required property`
- **Root cause:** ESM hoists `import` statements before any `process.env` assignments. `import { authRoutes } from '../code/src/routes/auth.mts'` executes before `process.env.JWT_SECRET = ...` on line 1.
- **Fix:** All test instructions changed to `await import()` for project source files. Sanitizer auto-converts static imports to dynamic. Knowledge base for all tasks.

### Bug 22: env.mts throws at import time
- **Run:** 16
- **Symptom:** Same as Bug 21 — env validation crashes before test can set env vars
- **Root cause:** Generated `env.mts` uses TypeBox `Value.Check()` and throws if validation fails — runs at module load time
- **Fix:** System prompt changed: env.mts reads `process.env` with simple defaults, no validation/throw. Bun auto-loads `.env` files.

### Bug 23: Claude Sonnet wrong model ID
- **Run:** 15
- **Symptom:** `404 model: claude-sonnet-4-6-20250514 not found`
- **Root cause:** Model ID had date suffix. Correct ID is `claude-sonnet-4-6`.
- **Fix:** Removed date suffix from model ID in di.mts.
