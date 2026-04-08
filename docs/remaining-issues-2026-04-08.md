# Remaining Pipeline Issues — 2026-04-08

## Current Run Status (full pipeline)
- setup-foundation: OK (iter 2)
- model-user: OK (iter 1)
- model-todo: FAIL (5 iters) — **fixing now**
- repo-user: FAIL (5 iters) — 2 errors
- repo-todo: FAIL (5 iters) — 54 errors
- service-auth: FAIL (5 iters) — 1 error (very close)
- Remaining tasks: still running

## Issue 1: model-todo — TypeBox optional/default patterns (FIXING NOW)
**15 pass, 5 fail.** All failures are `Value.Check()` returning false for valid data.

Root causes:
1. LLM uses `Type.String({ optional: true })` — TypeBox doesn't support `optional` as a property. Must use `Type.Optional(Type.String())`
2. LLM uses `{ default: 'value' }` and expects `Value.Check()` to apply defaults — it doesn't. Missing optional fields need `Type.Optional()` wrapper.
3. `additionalProperties: false` is strict — any extra property fails. The generated tests or code may have mismatched properties.

Fix: Add TypeBox optional/default rules to codegen prompt.

## Issue 2: repo-user — 2 errors
Not yet investigated. Likely import resolution or API mismatch.

## Issue 3: repo-todo — 54 errors
Not yet investigated. Likely cascading from model-todo issues.

## Issue 4: service-auth — 1 error
Very close. Not yet investigated.

## Issue 5: endpoint tasks
Not yet investigated — depends on upstream tasks.
