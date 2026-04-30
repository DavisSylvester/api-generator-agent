# docs/ -- Existing Documentation Index

Summary of all pre-existing documentation files.

---

## Architecture & Design

| File | Purpose |
|------|---------|
| `architecture-overview.md` | System architecture: ASCII diagram, module map, data flow, design decisions |
| `TASKS.md` | Phase-by-phase task tracking with completion checkboxes |

## Standards & References

| File | Purpose |
|------|---------|
| `bun.md` | Bun runtime reference: package management, native APIs, testing, tsconfig |
| `elysia.md` | Elysia framework patterns: routing, validation, DI, error handling, auth |
| `azure.md` | Azure standards: tool invocations, env vars, Functions, security, deployment |
| `template-authoring-guide.md` | How to create addon templates: ITemplate contract, conventions, testing |
| `typebox-migration-2026-04-08.md` | Zod-to-TypeBox migration: rationale, mapping table, critical patterns |

## User Documentation

| File | Purpose |
|------|---------|
| `getting-started.md` | First-time setup tutorial: install, configure LLM, write PRD, run, inspect output |
| `usage-guide.md` | Full CLI reference: commands, flags, env vars, pipeline phases, output structure |

## Change Logs & Fix Plans

| File | Purpose |
|------|---------|
| `agent-overhaul-2026-04-07.md` | 3-phase architecture overhaul: task types, assembly step, failure handling |
| `pipeline-overhaul-2026-04-07.md` | 6-part pipeline fix: barrel rules, QA modes, prompt logging, structured feedback |
| `qa.plan.fix.2026-04-07.md` | Opus 4.6 audit results: 3 critical + 10 medium fixes with implementations |
| `qa.plan.fix.2026-04-17.md` | Root cause analysis of `process.env` module-load failures, TEST_ENV_STUBS |
| `remaining-issues-2026-04-08.md` | Snapshot of task failures from TypeBox optional/default pattern misuse |

## Knowledge Bases

### docs/qa.knowledge.md
Global QA knowledge: missing packages, syntax errors, module-load env var rule.

### docs/knowledge-bases/
10 task-specific knowledge files:

| File | Key Lesson |
|------|-----------|
| `setup-foundation-knowledge.md` | Do NOT test health endpoint date field |
| `model-user-knowledge.md` | Do NOT test email regex validation |
| `model-todo-knowledge.md` | TypeBox optional union pattern, runtime type erasure |
| `repo-todo-knowledge.md` | Keep repo code concise, only test basic CRUD |
| `service-todo-knowledge.md` | Never `.toContain()` on TypeBox error messages |
| `middleware-auth-knowledge.md` | `.as('plugin')` critical, never validate JWT against entity schemas |
| `endpoint-auth-knowledge.md` | Auth endpoints are public, factory functions for config |
| `endpoint-users-knowledge.md` | Plugin prefix must match test URL |
| `endpoint-todos-knowledge.md` | Result type must have runtime `ok()`/`err()` functions |
| `integration-main-knowledge.md` | Check actual exports, handle factory vs constant |

**Universal rules across ALL knowledge bases:**
1. Test files MUST be in `tests/` only -- never under `code/`
2. Use `await import()` for project source files (ESM hoists static imports before env vars)

## Business & Strategy

| File | Purpose |
|------|---------|
| `comparison.md` | Feature-by-feature competitive analysis against 6 AI coding agents |
| `future-improvements.md` | Prioritized P2/P3 feature roadmap with competitor references |
| `marketing-plan-2026-04-13.md` | Go-to-market plan: positioning, 30-day content calendar, growth loops |

## External Project Recipes

| File | Purpose |
|------|---------|
| `beautician-flutter-stitch-prompt.md` | Copy-paste recipe for building a Flutter app from the generated API |
