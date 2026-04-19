# QA Agent Knowledge Base

> Auto-accumulated learnings from test failures. Referenced in all future QA calls.


## Missing package in test workspace

Tests run in an isolated workspace directory that has no node_modules.
Do NOT import third-party packages unless they are available in the workspace.
Prefer testing with built-in bun:test utilities and inline mocks.
Missing package that triggered this: `elysia`

_Recorded: 2026-04-06T19:54:49.562Z_

## SyntaxError in generated test file

Generated test file had a syntax error: Failed to parse JSON
Ensure all generated TypeScript is valid. Common issues:
- Missing closing braces or parentheses
- Using non-existent imports from the source code
- Mixing CommonJS and ESM syntax

_Recorded: 2026-04-06T20:51:44.696Z_

## Do NOT read `process.env` at module-load time

When generated code reads `process.env.X` at the top level of a module (or
inside a class constructor that runs on first import) and throws if the var
is missing, the test harness cannot import the module. Every downstream
re-export TDZ's with:

```
ReferenceError: Cannot access 'X' before initialization.
```

This is NOT a TDZ bug in the emitted code — it is a symptom of a failed
module evaluation cascading to every consumer. The fix-loop cannot resolve
it because the error message the model sees is the downstream TDZ, not the
real cause.

**Rules for generated code:**

1. Do not touch `process.env` at module-load. Never throw from a top-level
   read.
2. Read env lazily inside a factory function (`createAuthService(config)`)
   that the DI layer calls at app startup. Pass the resolved config in as
   an argument to constructors.
3. If a service has a hard requirement on a missing env var, throw from
   the factory, not from module initialization. The DI layer can surface
   a clean startup error; tests can construct the service with injected
   stub config without booting the factory.

**Sentinel errors to recognize in failure output:**

- `error: X_ISSUER is required` / `X_AUDIENCE is required` etc — move the
  check into a factory.
- `ReferenceError: Cannot access 'createX' before initialization` — almost
  always a downstream symptom of a module-load throw somewhere in the
  import graph. Do NOT try to reorder exports; find the import that reads
  env at module-load.

Harness-side workaround (separate from this rule): the QA agent now
populates placeholder env vars before spawning `bun test` / integration
server (see `src/agents/qa-agent.mts` — `TEST_ENV_STUBS`). Generated code
that respects the rule above does not depend on the stubs.

_Recorded: 2026-04-17T00:00:00.000Z_
