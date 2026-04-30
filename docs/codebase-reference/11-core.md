# src/core/ -- Core Enums, Interfaces, and Types

Foundational domain types used throughout the template-based generation engine.

---

## Enums (src/core/enums/)

### addon-type.mts
**Exports:** `ADDON_TYPE` (const enum)
**Values:** `AZURE_TERRAFORM`, `AWS_CDK`, `QUEUE_CONSUMER`, `EXTERNAL_API_CLIENT`, `TEAMS_NOTIFICATION`, `TIMER_JOB`
**Why:** Type-safe addon identification.

### template-type.mts
**Exports:** `TEMPLATE_TYPE` (const enum)
**Values:** `INTERFACE`, `SCHEMA`, `REPOSITORY`, `SERVICE`, `ROUTER`, `TEST`, `SWAGGER_DETAIL`, `INFRASTRUCTURE`
**Why:** Type-safe template layer identification.

### index.mts
Barrel file re-exporting both enums plus `GENERATION_STATUS` type.

---

## Interfaces (src/core/interfaces/)

### i-feature-spec.mts
**Exports:** `IFieldSpec`, `IEntitySpec`, `IFeatureSpec`
**What:** Domain model specs: `IFieldSpec` defines a field (name, type, required, unique, default, constraints). `IEntitySpec` defines an entity with fields and relationships. `IFeatureSpec` defines a feature with entities and dependencies.
**Why:** Input contract for the generation engine.

### i-generation-plan.mts
**Exports:** `IGenerationPlan`, `IFileTarget`
**What:** A plan listing all files to generate with their template type, entity, and target path.
**Why:** Output of the planner, input to the generation engine.

### i-review-gate.mts
**Exports:** `ReviewDecision`, `IReviewGate`
**What:** Interface for human or automated review checkpoints. Decisions: `APPROVE`, `REQUEST_CHANGES`, `SKIP`.
**Why:** Extensibility point for human-in-the-loop.

### i-review-gate-auto.mts
**Exports:** `AutoApproveReviewGate`
**What:** Always approves. Used in automated pipeline runs.

### i-review-gate-callback.mts
**Exports:** `CallbackReviewGate`
**What:** Delegates review decision to a callback function. For custom review logic.

### i-template.mts
**Exports:** `ITemplate`
**What:** Contract for all templates: `plan()` (returns file targets), `render()` (returns generated code), `validate()` (checks output).
**Why:** Enables pluggable template system (base + addon templates).

### i-trace-entry.mts
**Exports:** `ITraceEntry`
**What:** Schema for audit log entries: timestamp, step, entity, status, duration, input/output hashes, metadata.
**Why:** Observability and debugging.

### i-verification-result.mts
**Exports:** `IVerificationResult`
**What:** Result of a verification gate: passed, errors, warnings, gate name.
**Why:** Standardized verification output.

### index.mts
Barrel file re-exporting all interfaces.

---

## Types (src/core/types/)

### generation-status.mts
**Exports:** `GENERATION_STATUS`
**What:** Const object with values: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `SKIPPED`.
**Why:** Track feature generation lifecycle.

### index.mts
Barrel file re-exporting `GENERATION_STATUS`.

---

## src/core/index.mts
Top-level barrel re-exporting all enums, interfaces, and types.
