# src/container/ -- Dependency Injection

---

## di.mts

**Exports:** `Container`, `createContainer()`

**What it does:** The application's composition root. `createContainer` takes an `EnvConfig` and constructs the entire dependency graph:

1. **Logger:** Winston with console transport, custom formatting (colored levels, phase headers in cyan, pass/fail colored), secret redaction via `redactSecrets`.

2. **LLM Factories:** Primary `ILlmFactory` based on provider:
   - **Ollama:** Separate cloud-targeted factory for codegen/QA (`https://api.ollama.com` with bearer token, 10-minute timeout) + local instance for planning/docs.
   - **OpenAI/Anthropic:** Single factory per provider.

3. **Agents:** Instantiates all seven agents (`PlanningAgent`, `CodegenAgent`, `EslintAgent`, `QaAgent`, `DocumentationAgent`, `FlutterUiAgent`, `PrdExpansionAgent`) with respective model configs, factories, and logger.

4. **Cost Tracking:** `CostTracker` instance.

5. **Fallback Tiers:** Built from available API keys:
   - If primary isn't OpenAI and OpenAI key exists -> add gpt-5.4 tier (16 iterations)
   - If primary isn't Anthropic and Anthropic key exists -> add claude-sonnet-4-6 tier (16 iterations)

6. **Pipeline Config:** Assembled from env values.

7. **Notifications:** `ConsoleChannel` always + `TelegramChannel` if configured.

**Why it exists:** Composition root pattern -- all dependency creation in one place. No agent constructs its own dependencies. Makes the system testable, configurable, and maintainable.
