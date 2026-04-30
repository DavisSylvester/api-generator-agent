# .ai/ and .doc/ -- Internal Documentation

---

## .ai/ -- ODA Agent Activity

The `.ai/` directory records the work done by the "oda-agent" (Autonomous Development Agent) pattern, which uses a Worker-Reviewer loop to implement tasks.

### .ai/planning/agent-one/prd.md
**Contains:** Meta-PRD for extending the API generator agent itself. Defines 8 tasks: migrate to Zod validation, update codegen/planning prompts, add `FeaturesStore`, add `SessionStore`, add Playwright verification, integrate into pipeline.

### .ai/activity/agent-one/TASK-001/
**Contains:** Worker report and reviewer approval for updating the codegen system prompt from TypeBox to Zod. 21 tests passed. Decision: SHIP.

### .ai/activity/agent-one/TASK-002/
**Contains:** Worker report and reviewer approval for updating the planning system prompt. 21 tests passed. Decision: SHIP.

### .ai/activity/agent-one/TASK-003/
**Contains:** Worker report and reviewer approval for creating `FeaturesStore`. 8 tests passed. Decision: SHIP.

### .ai/activity/agent-one/TASK-004/
**Contains:** Worker report and reviewer approval for `SessionStore` + pipeline integration. 34 tests passed. Decision: SHIP.

**Why the .ai/ directory exists:** Demonstrates the ODA agent's worker-reviewer loop in action. Each task has generation, testing, and review artifacts.

---

## .doc/ -- Internal Project Documentation

### .doc/agent-flow.md
**Contains:** Exhaustive pipeline documentation with 4 diagrams (flowchart, sequence, swimlane, data flow), component inventory table, and LLM call map.
**Why:** Master reference for understanding the full pipeline architecture.

### .doc/upcoming-features.md
**Contains:** 7 planned features: resume, cost estimator, parallel execution verification, Telegram notifications/resume, warm cache, single-task rerun.
**Why:** Development roadmap.

### .doc/graphs/
Three diagram files in multiple formats (Mermaid, Draw.io XML, Lucidchart JSON, Visio CSV):
- `01-pipeline-flowchart.md` -- Full pipeline from init to cleanup
- `02-swimlane-diagram.md` -- 6 responsibility lanes
- `03-architecture-diagram.md` -- 6 horizontal layers with design patterns

### .doc/history/
Project evolution records:

| File | Contents |
|------|----------|
| `00-overview.md` | Timeline from Run 1 (60% pass) to Run 17 (100% -- first perfect run) |
| `01-bugs-and-fixes.md` | All 23 bugs across 17 runs with symptoms, root causes, and fixes |
| `02-architecture-decisions.md` | 8 ADRs: MongoDB over SQLite, `.resolve()` over `.derive()`, real DB testing, knowledge bases, multi-tier fallback, `await import()`, etc. |
| `03-knowledge-bases.md` | Knowledge base system documentation with per-task rules and impact data |
| `04-fallback-system.md` | 3-tier model fallback documentation with results table |
| `05-run-by-run.md` | Detailed results for all 17 runs (pre-MongoDB: 60-80%, post-MongoDB: 42% -> 100%) |
| `06-model-usage-and-costs.md` | Model performance data: 588 LLM calls, ~2.37M prompt tokens, $7-14 total, development token usage (~9.8M) |

---

## sample-prds/ -- Test Input PRDs

| File | Complexity | Description |
|------|-----------|-------------|
| `todo-api.md` | Simple | User + Todo, JWT auth, CRUD, pagination |
| `bookmark-manager.md` | Medium | User + Folder (nested) + Bookmark, tags, search |
| `beautician-scheduling.md` | Medium | Multi-tenant scheduling, 6 entities, time slots, discounts |
| `bjj-open-mat-finder.md` | Complex | Geospatial, Auth0, Google Places, 6 entities, 25+ endpoints |
| `bjj-open-mat-flutter-app.md` | Complex | Flutter mobile app, 33 screens, Google Stitch design |

### examples/bookmark-api-prd.md
Identical to `sample-prds/bookmark-manager.md`. Alternative location for discoverability.
