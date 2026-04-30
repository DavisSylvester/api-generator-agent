# src/generation/ -- Template-Based Generation Engine

The deterministic code generation layer using TypeScript template literals.

---

## engine.mts

**Exports:** `GenerationEngine`

**What it does:** Orchestrates template-based code generation:
1. Takes a `IGenerationPlan` (list of file targets)
2. For each target, looks up the template in `TemplateRegistry`
3. Calls `template.render()` with the entity spec
4. Runs through review gates (auto-approve or callback)
5. Writes generated files via `FileWriter`
6. Returns a manifest of all generated files

**Why it exists:** The original deterministic generation approach (before the LLM-based pipeline). Takes a plan and executes it through templates.

---

## template-registry.mts

**Exports:** `TemplateRegistry`

**What it does:** Registry mapping template types to template implementations. Pre-registers all base templates (interface, schema, repository, service, router, test, swagger-detail, infrastructure). Supports:
- `register(type, template)` -- add a template
- `get(type)` -- retrieve a template
- `registerAddon(name, template)` -- register an addon template
- `getAddon(name)` -- retrieve an addon

**Why it exists:** Decouples template lookup from the generation engine. New templates can be registered without modifying the engine.

---

## addon-discovery.mts

**Exports:** `discoverAddons()`

**What it does:** Scans the `templates/addons/` directory for addon templates. For each subdirectory, dynamically imports `index.mts` and validates it implements `ITemplate`.

**Why it exists:** Filesystem-based plugin discovery so addons can be added by dropping a folder.

---

## template-contract-validator.mts

**Exports:** `validateTemplateContract()`

**What it does:** Validates that a template implementation satisfies the `ITemplate` interface contract: has `plan()`, `render()`, `validate()` methods, returns correct types, produces non-empty output.

**Why it exists:** Catches malformed templates early rather than at generation time.

---

## index.mts
Barrel file re-exporting `GenerationEngine`, `TemplateRegistry`, `discoverAddons`, `validateTemplateContract`.
