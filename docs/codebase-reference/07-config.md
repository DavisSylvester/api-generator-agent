# src/config/ -- Configuration and Environment

---

## env.mts

**Exports:** `LLM_PROVIDERS`, `LlmProvider`, `EnvConfig`, `loadEnv()`, `preflightLlmCheck()`

**What it does:** Defines and validates all environment variables using Zod:

| Category | Variables |
|----------|-----------|
| **LLM Provider** | `LLM_PROVIDER` (ollama/openai/anthropic, default: ollama) |
| **API Keys** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_API_KEY` (conditionally required) |
| **Ollama** | `OLLAMA_HOST` (default: `http://localhost:11434`) |
| **LangSmith** | Endpoint, API key, project, enabled flag |
| **Pipeline** | `MAX_FIX_ITERATIONS` (1-20, default: 20), `MAX_CONCURRENCY` (1-8, default: 4), `WORKSPACE_DIR`, `LLM_TIMEOUT_MS` (10s-1hr, default: 30min), `INTEGRATION_PORT`, `TASK_COST_LIMIT` (default: $3.00) |
| **Notifications** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NOTIFICATION_INTERVAL_MS` |

Uses `superRefine` for cross-field validation (e.g., OpenAI key required when provider is openai).

`preflightLlmCheck` pings Ollama's `/api/version` before starting.

**Why it exists:** Validates all env vars at startup with clear error messages.

---

## eslint.config.mts

**Exports:** Default ESLint config array

**What it does:** ESLint rules for `.mts` files: no-unused-vars (warn), prefer-const, no-var, strict equality, curly braces, semicolons, single quotes, trailing commas, no console.log, prefer arrow functions.

**Why it exists:** Ensures LLM-generated code meets consistent style standards.

---

## fallback-tiers.mts

**Exports:** `FallbackTier`

**What it does:** Interface defining a fallback LLM tier: `name`, `model`, `maxIterations`, `createChatModel` factory.

**Why it exists:** Standardizes multi-model escalation configuration.

---

## models.mts

**Exports:** `AgentRole`, `ModelChainConfig`, `PROVIDER_MODEL_MAP`, `MODEL_CHAINS`

**What it does:** Maps each LLM provider to model configurations per agent role:

| Role | Ollama | OpenAI | Anthropic |
|------|--------|--------|-----------|
| planning | qwen3.6:latest (0.3) | gpt-5.4 | claude-opus-4-7 |
| codegen | qwen3-coder-next:cloud (0.2) | gpt-5.4 | claude-opus-4-7 |
| documentation | qwen3.6:latest (0.1) | gpt-5.4 | claude-opus-4-7 |
| qa | qwen3-coder-next:cloud (0.2) | gpt-5.4 | claude-opus-4-7 |
| flutter-ui | qwen3-coder-next:cloud (0.2) | gpt-5.4 | claude-opus-4-7 |
| prd-expansion | qwen3.6:latest (0.3) | gpt-5.4 | claude-opus-4-7 |

**Why it exists:** Centralizes model selection. Different roles have different temperature settings.
