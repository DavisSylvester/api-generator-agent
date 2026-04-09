# model-todo Knowledge Base

> Persistent knowledge accumulated from pipeline runs. Never delete this file.

## Run: 2026-04-09 (3-task run, b90ltzy2n) — PASSED

### Iteration 1 — FAIL
```json
{ "error": "Value.Check returning false for valid data — codegen used Type.Union without Type.Optional wrapper", "resolutionTried": "Updated codegen prompt: Type.Optional(Type.Union([...], { default: 'medium' })) for optional unions", "status": true }
```

### Iteration 2 — PASS
```json
{ "error": null, "resolutionTried": "Codegen fixed optional union pattern on iteration 2", "status": true }
```

## Historical Failures (resolved)

### TypeBox format: 'email' (2026-04-08)
```json
{ "error": "Value.Check returns false for valid email — TypeBox has no built-in email format validator", "resolutionTried": "Replaced format:'email' with pattern regex in codegen prompt", "status": true }
```

### Bun.Database not a constructor (2026-04-08)
```json
{ "error": "TypeError: Bun.Database is not a constructor", "resolutionTried": "Added 'import { Database } from bun:sqlite' examples to QA and codegen prompts", "status": true }
```

### Type.Optional(Type.Boolean(), false) ignored (2026-04-08)
```json
{ "error": "Value.Check fails — second arg to Type.Optional() is ignored in TypeBox 0.34", "resolutionTried": "Changed to Type.Optional(Type.Boolean({ default: false })) — default inside type options", "status": true }
```

### export type X = Static<> erased at runtime (2026-04-08)
```json
{ "error": "Export named 'TodoResponse' not found — type aliases stripped at runtime", "resolutionTried": "Two-pass sanitizer: strip Static<> type aliases then clean barrel re-exports", "status": true }
```

### Barrel re-exports type-only names (2026-04-08)
```json
{ "error": "export type { X } from barrel breaks at runtime", "resolutionTried": "Strip export type { } re-export lines from barrels in sanitizer", "status": true }
```

### Test imports from barrel missing exports (2026-04-08)
```json
{ "error": "Test imports from index.mts which doesn't re-export all names after sanitization", "resolutionTried": "Moved test generation to codegen — same LLM writes code + tests, imports always match", "status": true }
```
