# src/agents/ -- LLM-Backed Agents

All agents extend `BaseAgent<TIn, TOut>` (except `EslintAgent`) and implement the `execute()` method for their specific concern.

---

## base-agent.mts

**Exports:** `TokenUsage` (interface), `BaseAgent<TIn, TOut>` (abstract class)

**What it does:** Abstract foundation for every LLM-backed agent. Implements a model fallback chain pattern:
- `run(input)` iterates through models in `ModelChainConfig.models`, tries each sequentially, returns the first success.
- Creates a chat model via `ILlmFactory`, sets up LangSmith tracing, starts a `ThinkingSpinner`, wraps calls in `withTimeout`.
- Records timing, token usage, and model used on success.
- `runWithModel(input, chatModel, modelName)` bypasses the fallback chain for a specific model (used by diagnostic/fallback systems).

**Why it exists:** Centralizes cross-cutting LLM concerns: model fallback, timeout, token tracking, tracing, spinner UX. Without it, every agent duplicates this infrastructure.

---

## codegen-agent.mts

**Exports:** `NO_CODE_BLOCKS_ERROR`, `CodegenInput`, `CodeFile`, `CodegenOutput`, `CodegenAgent`

**What it does:** The core code generation agent. Two modes:
- **Generate mode:** Takes task description + optional context, sends to LLM with codegen system prompt, parses response into file objects.
- **Fix mode:** Takes previous code + errors, builds a fix prompt, asks LLM for corrected code.

Response parsing extracts fenced code blocks with file paths (e.g., `` ```src/routes/user.mts ``).

`sanitizeCodeFiles()` performs multi-pass post-processing:
- **Pass 1:** Comments out forbidden DI imports, converts `import type` to `import`, fixes test imports, adds `async` to `.resolve()` callbacks, replaces `.derive()` with `.resolve()`, auto-injects `.as('plugin')`, removes `env.mts` imports.
- **Pass 2:** Cleans barrel re-exports by cross-referencing actual exports.

**Why it exists:** The central "worker" agent that translates task specs into TypeScript source. The extensive sanitization exists because LLMs consistently produce patterns that break at runtime.

---

## documentation-agent.mts

**Exports:** `HoppscotchCollection`, `DocumentationAgent`

**What it does:** Takes all generated code as a string, sends to LLM with documentation prompt, expects back a Hoppscotch collection JSON. Validates the JSON has required `v` and `name` fields.

**Why it exists:** Automates API documentation generation in Hoppscotch format (similar to Postman).

---

## eslint-agent.mts

**Exports:** `EslintAgent`

**What it does:** Does NOT extend BaseAgent -- not LLM-backed. Writes a minimal ESLint config, then runs `bun eslint --fix` on each file individually. Returns auto-fixed content.

**Why it exists:** Enforces code quality rules on LLM-generated code. LLMs frequently produce `var`, `console.log`, loose equality, missing curly braces.

---

## flutter-ui-agent.mts

**Exports:** `FlutterUiInput`, `FlutterCodeFile`, `FlutterUiOutput`, `FlutterUiAgent`

**What it does:** Generates Flutter/Dart UI code for mobile screens. Takes a `FlutterScreenTask`, PRD text, and API endpoint references. Parses `.dart` fenced code blocks from LLM response. Includes directory traversal protection.

**Why it exists:** Extends the system to produce Flutter mobile UIs that consume the generated API endpoints.

---

## planning-agent.mts

**Exports:** `PlanningAgent`

**What it does:** Takes a PRD string, sends to LLM with planning prompts, expects JSON task graph. Response is cleaned, parsed, and validated against a Zod schema (`planResponseSchema`). Enforces: each task has `id`, `name`, `description`, `dependsOn[]`, `type`, `metadata`. Checks for exactly one root task. Hashes PRD with SHA-256 for cache keying.

**Why it exists:** Decomposes a high-level PRD into an ordered, dependency-aware task graph. The "brain" that turns requirements into a build plan.

---

## prd-expansion-agent.mts

**Exports:** `PrdExpansionAgent`

**What it does:** Takes a brief user prompt (e.g., "Build me a todo API with auth") and expands it into a full PRD markdown document with required sections: Overview, Stack, Entities, Endpoints, Validation, Non-Functional Requirements.

**Why it exists:** Bridges the gap between a casual user prompt and the structured PRD that the planning agent requires.

---

## qa-agent.mts

**Exports:** `QaInput`, `TestPhaseResult`, `QaResult`, `QaAgent`

**What it does:** Large, complex agent that executes tests against generated code. Despite extending BaseAgent, does NOT use the LLM.

Key operations:
1. **MongoDB setup:** Manages Docker container (`qa-mongodb`) on port 27018.
2. **Dependency installation:** Scans for third-party imports, blocks forbidden packages (DI frameworks, native addons), ensures baseline deps, runs `bun add`.
3. **Unit testing:** Runs `bun test` with 30s timeout. Injects `TEST_ENV_STUBS` (dummy env vars). Extracts errors via pattern matching.
4. **Integration testing:** Finds entry file, starts server, waits for ready, runs Hoppscotch CLI against collection.
5. **Stale test cleanup:** Removes test files from wrong directories.

**Why it exists:** The "reviewer" in the Worker-Reviewer loop. Validates generated code by running real tests against MongoDB.

---

## qa-knowledge.mts

**Exports:** `KnowledgeEntry`, `readKnowledge()`, `appendKnowledge()`, `analyzeTestErrors()`

**What it does:** Persistent learning system. When tests fail, `analyzeTestErrors()` scans output for known patterns (import resolution, missing packages, syntax errors, import type erasure, leaked promises, TypeBox wrong imports, native addon failures, wrong exports) and generates structured knowledge entries. Deduplicates and appends to a markdown file.

**Why it exists:** Creates a feedback loop where the system learns from mistakes. Knowledge entries are included in fix prompts so the LLM avoids known pitfalls.
