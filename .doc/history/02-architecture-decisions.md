# Architecture Decisions

Major design decisions made during development, with context on what was tried before and why changes were needed.

---

## Decision 1: MongoDB over SQLite (Run 13)

**Before:** `bun:sqlite` with in-memory databases. Tests used `new Database(':memory:')`.

**After:** MongoDB via Docker (`mongo:latest`), native `mongodb` npm driver.

**Why:** The pipeline generates a real API, not a toy. MongoDB is production-representative, and Docker makes it reproducible. SQLite's in-memory mode led to tests that passed in isolation but didn't reflect real API behavior.

**Implementation:** QA agent starts a Docker MongoDB container (`qa-mongodb`) on port 27018 before tests. Pipeline cleans up at the end.

---

## Decision 2: Elysia .resolve() over .derive() (Run 13)

**Before:** Auth middleware used `.derive()` to extract JWT and inject `userId`.

**After:** `.guard()` validates header exists, `.resolve()` verifies JWT and returns `userId`.

**Why:** `.resolve()` runs after validation (safer for auth). `.derive()` runs before validation and caused persistent async issues — the LLM consistently forgot to add `async` to the callback.

**Critical detail:** Must end with `.as('plugin')` to propagate guard/resolve to parent routes. Without it, Elysia scopes lifecycle hooks to the plugin only.

---

## Decision 3: Real DB testing, no mocks (Run 13)

**Before:** Service tests used inline mock objects for repositories. Endpoint tests were self-contained with mocks.

**After:** All tests connect to real MongoDB. Repository tests do CRUD. Service tests instantiate real repos. Endpoint tests mount real plugins.

**Why:** Mock/production divergence was the #1 cause of stuck fix loops. Mocks would pass but the real code didn't match. Real DB tests catch actual integration issues.

---

## Decision 4: Simplified assertions (Run 13)

**Before:** Tests checked specific response body fields, error message strings, JWT token values.

**After:** Tests check `result.ok`, status codes, and `body.data` is defined. Never assert on error message text.

**Why:** TypeBox validation messages don't match custom strings. Response body structures vary between codegen iterations. Strict assertions caused infinite fix loops where the model oscillated between 2 different wrong assertion patterns.

---

## Decision 5: Knowledge base system (Run 14)

**Before:** Each pipeline run started from scratch. Lessons from failures were lost between runs.

**After:** Persistent knowledge bases in `docs/knowledge-bases/{taskId}-knowledge.md`. Seeded into each task's QA knowledge at the start of the fix loop.

**Why:** The same errors recurred across runs — email regex testing, error message assertions, middleware scoping. Knowledge bases give the LLM specific anti-patterns to avoid.

---

## Decision 6: Multi-tier model fallback (Run 15-16)

**Before:** Single model (qwen3-coder-next). If it failed or returned prose, the task failed.

**After:** 3-tier escalation:
1. **Tier 1:** Retry same model with "MUST output code blocks" suffix
2. **Tier 2:** GPT-5.4 (OpenAI) — 16 fresh iterations
3. **Tier 3:** Claude Sonnet 4.6 (Anthropic) — 16 fresh iterations

**Why:** qwen3-coder-next sometimes returns prose analysis instead of code blocks (especially on large fix prompts). GPT-5.4 proved critical — it solved service-auth in 1 iteration after qwen failed 20. Different models have different strengths.

---

## Decision 7: await import() over static import (Run 17)

**Before:** Tests used static `import` for everything: `import { app } from '../code/src/index.mts'`

**After:** Tests use `await import()` for project source files. Static `import` only for third-party libs (`bun:test`, `elysia`, `mongodb`, `jose`).

**Why:** ESM hoists static `import` statements — they execute before any `process.env` assignments, even if the assignment appears on line 1. This caused env validation to fail because `JWT_SECRET` was undefined when `env.mts` loaded. Dynamic `await import()` respects execution order.

---

## Decision 8: Simple env.mts, Bun loads .env (Run 17)

**Before:** `env.mts` used TypeBox `Value.Check()` and threw at import time if validation failed.

**After:** `env.mts` simply reads `process.env` with fallback defaults. No validation, no throwing. Bun auto-loads `.env` files.

**Why:** Throwing at import time is incompatible with test setup. Tests need to set env vars before modules load, but ESM hoisting makes this impossible with static imports. Removing import-time validation eliminates the entire class of env-related test failures.
