# Run-by-Run Results

## Pre-MongoDB Era (Runs 1-12) — SQLite + .derive() + Mocks

### Run 1 (2026-04-07)
- **Result:** 8/10 passed
- **Bugs found:** ESLint ENOENT crash (#1), codegen file explosion (#2)

### Run 2 (2026-04-07)
- **Result:** 9/9 passed through service-user
- **Bugs found:** QA not installing deps (#3), fix mode summary too sparse (#4)

### Run 3 (2026-04-08)
- **Result:** setup-foundation stuck on date validation (8+ iters)
- **Bugs found:** Date field test loop (#6)

### Run 4 (2026-04-08)
- **Result:** 6/10 passed
- **Bugs found:** Test import prefix missing (#5)

### Run 5 (2026-04-08)
- **Result:** 9/10 passed
- **Bugs found:** Middleware async .derive() (#7)

### Run 6 (2026-04-08)
- **Result:** 8/10 passed
- **Bugs found:** File truncation drops tests (#8)

### Run 7 (2026-04-08)
- **Result:** 5/10 passed
- **Bugs found:** Codegen crash loses best-effort code (#9), service imports real repos (#10)

### Run 8 (2026-04-08)
- **Result:** 10/11 passed
- **Bugs found:** Middleware assertion mismatches (#11)

### Run 9 (2026-04-08)
- **Result:** 10/11 passed
- **Bugs found:** Baseline packages not installed (#12)

### Run 10 (2026-04-09)
- **Result:** 11/12 passed
- **Bugs found:** Model can't fix async .derive() (#13)

### Run 11 (2026-04-09)
- **Result:** ~8/14 (service-auth, middleware-auth stuck)
- **Note:** Auth tasks consistently problematic

### Run 12 (2026-04-09)
- **Result:** 8/14 passed — best pre-MongoDB run
- **Open questions:** 6 design decisions needed on middleware, DB, mocking, assertions
- **Passed:** setup-foundation, model-user, model-todo, model-auth, repo-user, repo-todo, service-auth, service-user
- **Failed:** service-todo, middleware-auth, endpoint-auth, endpoint-users, endpoint-todos, app-assembly

---

## MongoDB + Resolve Era (Runs 13-17)

### Run 13 (2026-04-09) — First MongoDB Run
- **Result:** 5/12 passed (42%)
- **Config:** MongoDB Docker, .resolve() pattern, real DB tests, 5 iterations
- **Passed:** setup-foundation (3), model-todo (2), repo-user (3), service-auth (5), service-user (1)
- **Failed:** model-user (email regex), repo-todo (timeout crash), service-todo (error msg assertions), middleware-auth (.as('plugin')), endpoint-auth, endpoint-users, endpoint-todos
- **Bugs found:** #14 (.as('plugin')), #15 (Result type export), #16 (email regex), #17 (error msg assertions), #18 (cloud timeout)
- **Fixes applied:** Knowledge base system, .as('plugin') in prompt + sanitizer, Result runtime helpers, timeout 5min→10min

### Run 14 (2026-04-09)
- **Result:** 6/12 passed (50%)
- **Config:** 15 iterations, 10-min timeout, knowledge bases active
- **Passed:** setup-foundation (1), model-user (2), model-todo (2), repo-user (3), repo-todo (8!), service-user (6)
- **Failed:** service-auth (codegen crash), service-todo (15/15), middleware-auth (codegen crash), endpoint-auth (15/15), endpoint-users (15/15), endpoint-todos (15/15)
- **Key wins:** model-user fixed (was stuck 5 iters), repo-todo fixed (was crashing)
- **New issues:** Cloud model returns prose instead of code blocks

### Run 15 (2026-04-09)
- **Result:** 10/12 passed (83%)
- **Config:** 15 iterations, knowledge bases, stale test cleanup
- **Passed:** setup-foundation (1), model-user (2), model-todo (2), model-types-barrel (2), repo-user (3), repo-todo (3), service-auth (3), service-user (1), service-todo (8), middleware-auth (6!)
- **Failed:** endpoint-auth (all 3 tiers), endpoint-todos (all 3 tiers)
- **Key wins:** middleware-auth FIRST EVER PASS, service-todo FIRST PASS since MongoDB
- **Bugs found:** #19 (codegen prose), #20 (stale test files)
- **Note:** Claude Sonnet model ID was wrong (claude-sonnet-4-6-20250514 → claude-sonnet-4-6)

### Run 16 (2026-04-10)
- **Result:** 8/12 passed (67%)
- **Config:** 15 iterations, GPT-5.4 as Tier 2 (replacing glm-5.1:cloud), Sonnet model ID fixed
- **Passed:** setup-foundation (1), model-user (3), model-todo (2), repo-user (5), repo-todo (9), service-user (1), service-todo (4), endpoint-users (GPT-5.4 iter 4!)
- **Failed:** service-auth (all 3 tiers), middleware-auth (all 3 tiers), endpoint-auth (all 3 tiers), endpoint-todos (all 3 tiers)
- **Key wins:** GPT-5.4 saved endpoint-users! First successful Tier 2 escalation.
- **Bugs found:** #21 (ESM import hoisting), #22 (env.mts throws at import time)

### Run 17 (2026-04-10) — PERFECT RUN
- **Result:** 13/13 passed (100%)
- **Config:** 20 iterations, await import(), simple env.mts, all sanitizers, all knowledge bases
- **Passed (all):**

| Task | Iters | Model | Notes |
|------|-------|-------|-------|
| setup-foundation | 1 | qwen3-coder-next | First-try |
| model-user | 1 | qwen3-coder-next | First-try (was 2-3 before) |
| model-todo | 1 | qwen3-coder-next | First-try |
| model-types-barrel | 5 | qwen3-coder-next | |
| repo-user | 1 | qwen3-coder-next | First-try |
| repo-todo | 1 | qwen3-coder-next | First-try (was 3-9 before) |
| service-auth | 1 | **GPT-5.4** | qwen failed 20, GPT-5.4 first-try |
| service-todo | 1 | qwen3-coder-next | First-try (was 4-8 before) |
| middleware-auth | 1 | qwen3-coder-next | First-try (was 6+ or failing) |
| endpoint-auth | 5 | qwen3-coder-next | First-ever primary pass |
| endpoint-users | 11 | qwen3-coder-next | |
| endpoint-todos | 1 | fallback (GPT-5.4/Sonnet) | qwen failed 20, fallback solved it |
| integration-main | 3 | qwen3-coder-next | App assembly |

- **Duration:** 56 minutes
- **8 of 13 tasks passed on first try**
- **GPT-5.4 fallback used for 2 tasks** (service-auth, endpoint-todos)

---

## Progression Chart

```
Run  1: ████████░░░░░░ 8/10
Run  5: █████████░░░░░ 9/10
Run  8: ██████████░░░░ 10/11
Run 12: ████████░░░░░░ 8/14 (best pre-MongoDB)
Run 13: █████░░░░░░░░░ 5/12 (MongoDB migration)
Run 14: ██████░░░░░░░░ 6/12
Run 15: ██████████░░░░ 10/12
Run 16: ████████░░░░░░ 8/12
Run 17: █████████████  13/13 PERFECT
```
