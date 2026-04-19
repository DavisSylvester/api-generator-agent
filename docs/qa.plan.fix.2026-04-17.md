# QA Pipeline Fix Plan — 2026-04-17

## Context

Full pipeline run against a real 21-task PRD (Davaco service-provider-api) failed 2 tasks:

- `endpoint-lookup` — hit the fix-loop ceiling at 16 iterations.
- `app-composition` — hit the same ceiling.

Diagnosis from `.workspace/<run-id>/tasks/<task>/iterations/15/errors.json`:

```
error: AAD_ISSUER is required
    at buildProviderConfig (...auth-service.mts:222:17)
    at new AuthService (...:58:29)
    at ...auth-middleware.mts:13:21

ReferenceError: Cannot access 'createEmployeeLookupRoutes' before initialization.
```

**Root cause.** The generated `auth-service.mts` reads `process.env.AAD_ISSUER` at module-load time and throws if missing. Tests that import `auth-middleware` (which imports `auth-service`) therefore TDZ the moment the module system tries to resolve the graph — every downstream export appears uninitialized. Iterations 6–15 were the codegen model flailing at what it perceived as a TDZ in its own code, but the real problem is upstream: the QA harness doesn't provide the env vars the generated code requires.

No amount of additional fix-loop iterations will fix this — it's a harness problem, not a codegen problem.

---

## Applied Patches (already in place)

### 1. Test env stubs in `qa-agent.mts`

**File:** `src/agents/qa-agent.mts`

Added `TEST_ENV_STUBS` static — a record of 17 placeholder env vars (AAD_*, AUTH0_*, GRAPH_*, SERVICE_ACCOUNT_CLIENT_IDS, FRONTEND_URL, INVITE_RESULT_URL) that satisfy the non-empty checks generated services perform at module-load. Spread into the env block of both `runBunTests` and the integration-server spawn.

Values are dummy/localhost — nothing leaves the sandbox.

### 2. Default `MAX_FIX_ITERATIONS` bumped 5 → 20

**File:** `src/config/env.mts`

The two failures exhausted iter=5 (actually ran 16 — config mismatch between report and per-task state suggests an existing bug worth a follow-up investigation). Bumped default cap so future runs get more attempts if a genuinely tractable problem needs more tries. `.env`-level override still works.

---

## Systemic Follow-ups

### 3. Teach codegen: "no env reads at module-load"

**Files:** `docs/qa.knowledge.md`, `docs/knowledge-bases/endpoint-auth-knowledge.md`

The stubs are a workaround. The durable fix is teaching the codegen model to never read `process.env` at module-load. Generated code should either:

- Read env inside a factory function called from DI wiring at app boot, OR
- Accept config as constructor arguments.

Add a dated knowledge entry explaining this — feeds into every future codegen call via the `qa-knowledge.md` prompt injection.

### 4. Load stubs from a config file (future)

Hardcoding 17 env var names in `qa-agent.mts` means adding the 18th requires a code edit + rebuild. Improvement: read `docs/test-env-stubs.json` (or env `QA_TEST_ENV_STUBS_PATH`) at container init. A new stubbed var becomes a JSON edit.

**Not implementing now.** Deferred until we see a third category of missing env var. Tracking here so the pattern isn't lost.

### 5. Reconcile the iteration-count discrepancy

Report: "Exceeded 5 fix iterations." Workspace: 16 iteration folders. Which is authoritative? The pipeline is either:

1. Running >5 iterations but reporting a stale ceiling (cosmetic bug), or
2. Running 5 iterations multiple times across retry tiers (multiple-tier fallback), and the folders accumulate across tiers.

Audit `src/orchestrator/fix-loop.mts` + `src/io/report-generator.mts` to clarify. If (1), fix the report. If (2), make the report surface per-tier iteration counts.

**Not blocking.** Cosmetic issue only.

---

## Verification

Rerun against the same PRD. Success criteria:

1. All 21 tasks pass (previous state: 19 pass, 2 fail).
2. No `"X is required"` or TDZ errors anywhere in `iterations/*/errors.json`.
3. Planning phase uses the cache (PRD hash unchanged since previous run) — should land in < 5s instead of 142s.
4. Documentation phase succeeds (last run failed on context length — separate issue, not addressed by this plan).

Expected duration: ~90 min (codegen dominates; planning skipped via cache).

---

## Out of Scope

- **Documentation-phase context overflow** (prompt 271K > 262K model ceiling). The planner's growing task output bloats the doc prompt. Needs chunking or a summarization pass before the doc agent runs. Tracked separately.
- **Fallback chain burnout** (Anthropic ran out of credits late in the run). Operational, not structural — user credit-balance problem, not agent bug.
