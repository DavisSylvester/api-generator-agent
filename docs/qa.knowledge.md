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
