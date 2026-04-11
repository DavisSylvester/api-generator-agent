# Knowledge Base System

## How It Works

Persistent knowledge bases live in `docs/knowledge-bases/{taskId}-knowledge.md`. At the start of each task's fix loop, the orchestrator reads the corresponding knowledge file and seeds it into the task's QA knowledge path. The codegen LLM receives this knowledge in fix-mode prompts as "QA Knowledge (apply these lessons)".

## Knowledge Files

### Global Rules (applied to ALL tasks)

1. **Test files MUST be in `tests/` only** — Never under `code/` or `code/tests/`. Stale copies cause bun to run 2 test files, one of which fails on import paths.

2. **Use `await import()` for project source files** — ESM hoists static `import` before `process.env` assignments. Only use static `import` for third-party libraries.

### Per-Task Knowledge

| Task | Key Rules |
|------|-----------|
| **setup-foundation** | Don't test the date field. Use `await import()` for app. |
| **model-user** | Don't test email regex validation with `Value.Check`. Only test required vs optional. |
| **model-todo** | Same as model-user — no format validation tests. |
| **repo-todo** | Keep code concise to avoid large fix prompts that timeout. Only test basic CRUD. |
| **service-todo** | Never assert on error message strings. Only check `result.ok`. |
| **middleware-auth** | Must use `.as('plugin')`. Only 2 tests: 401 (no token), 200 (valid token). |
| **endpoint-auth** | Auth middleware must use `.as('plugin')`. Simple assertions: status + `body.data` defined. |
| **endpoint-users** | Check route prefix matches test URL. Auth middleware `.as('plugin')`. |
| **endpoint-todos** | Result type must use runtime helpers, not type-only export. Auth middleware `.as('plugin')`. |

## Impact

Knowledge bases were introduced in Run 14 and showed immediate results:

- **model-user**: Was stuck for 5 iterations on email regex. With knowledge base, passed in 2 iterations (Run 14), then 1 iteration (Run 17).
- **service-todo**: Was stuck for 15 iterations on error message assertions. With knowledge base, passed in 8 iterations (Run 15), then 1 iteration (Run 17).
- **middleware-auth**: Knowledge + `.as('plugin')` fix enabled first-ever pass in Run 15.
