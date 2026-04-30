# tests/ -- Test Suite Reference

42 test files using `bun:test`, organized by subsystem.

---

## CLI Tests (tests/cli/)

| File | Tests |
|------|-------|
| `arg-parser.test.mts` | `parseArgs` with Result types for all 4 commands (generate, resume, status, trace) |
| `agent-bridge.test.mts` | Agent bridge options validation |
| `dry-run.test.mts` | Plan generation without writing files |
| `e2e-flow.test.mts` | End-to-end: parse PRD -> plan -> verify structure |
| `run-orchestrator.test.mts` | `parseInput`, `runPlanning`, `formatPlan`, `getRunStatus`, `getResumableFeatures` |

---

## Core Tests (tests/core/)

| File | Tests |
|------|-------|
| `enums.test.mts` | `TEMPLATE_TYPE`, `ADDON_TYPE`, `GENERATION_STATUS` values |
| `interfaces.test.mts` | `IFieldSpec`, `IEntitySpec`, `IFeatureSpec` shapes |
| `review-gate.test.mts` | `AutoApproveReviewGate`, `CallbackReviewGate` with all decisions |

---

## Generation Tests (tests/generation/)

| File | Tests |
|------|-------|
| `addon-discovery.test.mts` | Filesystem-based addon discovery |
| `compilation.test.mts` | Generated TypeScript syntax validation |
| `engine.test.mts` | `GenerationEngine` end-to-end (features in -> files out) |
| `template-contract-validator.test.mts` | Rejects null/invalid templates |
| `template-registry.test.mts` | All layer rendering (interface, schema, router, service, repository) |
| `template-registry-addons.test.mts` | Addon template registration |

---

## Git Tests (tests/git/)

| File | Tests |
|------|-------|
| `git-ops.test.mts` | `GitOps` init and commit in temp directories |

---

## Input Tests (tests/input/)

| File | Tests |
|------|-------|
| `prd-parser.test.mts` | PRD parsing: checkbox features, project name, completion status |
| `prompt-parser.test.mts` | Entity extraction from natural language, CRUD, kebab-case |
| `prd-interviewer.test.mts` | Mock LLM multi-turn conversation for PRD generation |

---

## Output Tests (tests/output/)

| File | Tests |
|------|-------|
| `file-writer.test.mts` | `FileWriter` single file writes with directory creation |

---

## Planning Tests (tests/planning/)

| File | Tests |
|------|-------|
| `dependency-resolver.test.mts` | Topological sort, cycle detection |
| `feature-extractor.test.mts` | Entity inference, relationship detection, deduplication |
| `generation-planner.test.mts` | Plan creation from parsed input |

---

## State Tests (tests/state/)

| File | Tests |
|------|-------|
| `features-store.test.mts` | init, markInProgress, markComplete, markFailed, getAll, getByStatus |
| `prd-store.test.mts` | save, load, list, updateCheckedFeatures |
| `session-store.test.mts` | generateHandoff markdown with run summary, task table, failed tasks |

---

## Template Tests (tests/templates/)

| File | Tests |
|------|-------|
| `infrastructure-template.test.mts` | Docker, env, eslint, gitignore, tsconfig templates |
| `interface-template.test.mts` | Entity interfaces, DTOs, barrels |
| `repository-template.test.mts` | MongoDB repository with CRUD, indexes |
| `router-template.test.mts` | Elysia routes, prefixes, response shapes |
| `schema-template.test.mts` | TypeBox schemas, static types |
| `service-template.test.mts` | Service classes, DI, barrels |

---

## Trace Tests (tests/trace/)

| File | Tests |
|------|-------|
| `trace-logger.test.mts` | Session ID, step recording, summary generation |
| `trace-writer-fs.test.mts` | JSON file writing |
| `session-summary.test.mts` | `buildSessionSummary`, `renderSessionSummaryMarkdown` |

---

## Verification Tests (tests/verification/)

| File | Tests |
|------|-------|
| `eslint-gate.test.mts` | ESLint gate pass/fail |
| `test-gate.test.mts` | Test gate with bun test |
| `smoke-gate.test.mts` | Health endpoint verification |
| `playwright-gate.test.mts` | Mocked browser Swagger screenshot |
| `pipeline.test.mts` | Verification pipeline orchestrating all gates |

---

## Addon Tests (tests/addons/)

| File | Tests |
|------|-------|
| `aws-cdk.test.mts` | Metadata, plan output, render patterns, validate pass/fail |
| `azure-terraform.test.mts` | Same structure |
| `external-api-client.test.mts` | Same structure |
| `queue-consumer.test.mts` | Same structure |
| `teams-notification.test.mts` | Same structure |
| `timer-job.test.mts` | Same structure |

---

## Other Tests

| File | Tests |
|------|-------|
| `activity-log.test.mts` | Markdown activity log: header, rows, pipe escaping |
| `parse-test-file.test.mts` | Extracting test code from fenced blocks and raw content |

---

## e2e/screenshots/

22 PNG screenshots from Flutter UI end-to-end tests:
- `01-06`: Initial screen captures (discover, search, training, profile, settings, notifications)
- `10-15`: Final screen captures
- `16-22`: Owner views (dashboard, gyms, add gym, sessions, create session, login, splash)

**Why they exist:** Visual verification artifacts from Flutter UI generation runs.
