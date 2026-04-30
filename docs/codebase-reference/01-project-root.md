# Project Root Files

## package.json

**Purpose:** Defines the project identity, entry point, dependencies, and scripts.

**Why it exists:** Required by Bun/npm to manage dependencies and configure the executable entry point.

**Key details:**
- **Name:** `api-generator-agent`, version `0.1.0`
- **Description:** "Multi-agent pipeline that generates production-ready Elysia APIs from PRDs"
- **Entry point:** `src/index.mts` (also registered as a bin command)
- **Module type:** ESM (`"type": "module"`)
- **Core dependencies:**
  - LangChain ecosystem (`@langchain/anthropic`, `@langchain/core`, `@langchain/langgraph`, `@langchain/ollama`, `@langchain/openai`, `langchain`, `langsmith`) -- multi-model AI orchestration
  - `elysia` -- the web framework the agent generates APIs for
  - `zod` + `zod-to-json-schema` -- schema validation for internal config
  - `winston` -- structured logging
  - `ulid` -- unique ID generation
  - `picocolors` -- terminal color output
  - `ollama` -- direct Ollama client
  - `eslint` -- linting generated code
  - `@hoppscotch/cli` -- API testing
- **Dev dependencies:** `@types/bun`, `mongodb` (test containers), `playwright` (Swagger screenshot validation)

---

## tsconfig.json

**Purpose:** Configures the TypeScript compiler for the project.

**Why it exists:** Enforces strict TypeScript compilation and enables Bun-native module resolution.

**Key details:**
- **Target/lib:** ESNext
- **Module:** `Preserve` -- lets Bun handle module resolution
- **Module resolution:** `bundler` -- Bun-native strategy
- **`allowImportingTsExtensions: true`** -- allows `.mts` imports directly
- **`verbatimModuleSyntax: true`** -- requires explicit `type` keyword on type-only imports
- **`noEmit: true`** -- type-checking only, Bun runs TS directly
- **Strict mode:** `strict: true` plus `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`

---

## .gitignore

**Purpose:** Tells git which files to exclude from version control.

**Why it exists:** Prevents committing generated artifacts, secrets, and editor metadata.

**Key entries:** `node_modules`, `out`, `dist`, `.env`, `.workspace` (generated output), `.langgraph_api`, `.DS_Store`

---

## README.md

**Purpose:** Comprehensive project documentation covering setup, usage, architecture, and configuration.

**Why it exists:** Primary entry point for anyone wanting to understand or use the project.

**Key contents:**
- Project description, prerequisites (Bun v1.1+, Docker, Node.js, LLM provider)
- Full CLI flag reference (`--prd`, `--resume`, `--iterations`, `--concurrency`, etc.)
- Sample PRDs table (4 examples at varying complexity)
- 11 pipeline phases documented
- Multi-tier LLM fallback system (Ollama -> OpenAI -> Anthropic -> Diagnostic)
- Environment variables tables
- Workspace directory structure

---

## CONTRIBUTING.md

**Purpose:** Contribution guidelines for developers.

**Why it exists:** Standard open-source practice to document how to set up, develop, and submit changes.

**Key contents:** Getting started steps, prerequisites, code standards (TypeScript strict, no `any`, conventional commits, Winston logger), PR process, architecture pointers.

---

## SECURITY.md

**Purpose:** Documents the project's security policy and threat model.

**Why it exists:** Projects handling API keys and executing generated code need transparency about secret management and security boundaries.

**Key contents:** Vulnerability reporting via email, API key handling (never logged, never in output), generated code execution boundaries, dependency pinning.

---

## langgraph.json

**Purpose:** Configuration file for the LangGraph development server.

**Why it exists:** Tells the LangGraph CLI where to find graph definitions for the experimental pipeline.

**Key contents:**
- Two graphs: `pipeline` and `task_loop` (both in `src-langgraph/graphs/`)
- Node.js 22 requirement
- `.env` file reference

---

## Shell Scripts

### run.sh / run.cmd
**Purpose:** Launch the pipeline in the foreground.
**Why:** Convenience wrappers that set the working directory and forward CLI args to `bun run src/index.mts`.

### run-bg.sh / run-bg.cmd
**Purpose:** Launch the pipeline in the background with logging and PID tracking.
**Why:** For long-running pipeline runs (hours), allows closing the terminal while the pipeline continues. Creates timestamped log files, saves PID.

### run-diagrams.sh / run-diagrams.cmd
**Purpose:** Launch the standalone diagram-generation agent.
**Why:** Generates architecture diagrams independently from the full pipeline. References a separate `diagram-agent` project.

---

## Sample PRD Files (Root)

### sample-prd.md
**Purpose:** Simple Todo API PRD for quick testing.
**Why:** Simplest test input. User + Todo models, auth, CRUD endpoints.

### davis.prd.md
**Purpose:** The meta-PRD for the api-generator-agent project itself (801 lines).
**Why:** Authoritative design document for the tool's own development. Full vision, architecture, phased delivery plan.

### bjj-open-mat-prd.md
**Purpose:** High-complexity PRD for a geospatial BJJ Open Mat Finder API.
**Why:** Exercises advanced features: geospatial queries, Auth0 JWT, Google Places, multi-entity relationships, 20+ endpoints.

### beautician-scheduling-prd.md
**Purpose:** Medium-complexity multi-tenant appointment scheduling PRD.
**Why:** Exercises multi-tenancy, time slot calculation, grace periods, discount codes.

---

## .claude/settings.local.json

**Purpose:** Claude Code local settings for this project.

**Why it exists:** Configures which bash commands, file reads, and web fetches are allowed without prompting.

**Key contents:** 40+ allowed bash commands (bun, npm, git, curl, eslint, playwright, etc.), allowed web fetches (GitHub), allowed file reads.

---

## .github/workflows/ci.yml

**Purpose:** GitHub Actions CI workflow.

**Why it exists:** Automated type checking on pushes and PRs to `main`.

**Key contents:**
- Single `typecheck` job on `ubuntu-latest`
- Uses `oven-sh/setup-bun@v2`
- Runs `bun install --frozen-lockfile --ignore-scripts`
- Runs `bunx tsc --noEmit --skipLibCheck`
- Intentionally lightweight: type-check only, no tests or builds

---

## Other Root Files

| File | Purpose |
|------|---------|
| `bun.lock` | Lockfile for deterministic dependency installation |
| `.gitkeep` | Placeholder to track the root directory in git |
| `dashboard-screenshot.png` | Screenshot of a generated Swagger UI (validation artifact) |
