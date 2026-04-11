# repo-todo Knowledge Base

## Keep generated code concise

The repo-todo task produces large fix prompts (14KB+) that can cause codegen timeouts on cloud models. To avoid this:
1. Keep the repository class focused — only CRUD methods
2. Do NOT generate extra helper functions or validation logic
3. All validation belongs in the service layer, not the repository

## Test pattern

Use real MongoDB. Connect in beforeAll, drop database for clean slate, close in afterAll.
Only test basic CRUD: create, findById, findByUserId. Do NOT test edge cases like pagination or toggleComplete in the initial test.

## Test files MUST be in tests/ only

Test files are ONLY allowed in the `tests/` folder. NEVER place test files under `code/` or `code/tests/`. If bun test picks up a stale test copy from `code/tests/`, it will fail with "Cannot find module" because the `../code/` import prefix resolves to `code/code/` which does not exist.

## Use await import() for project source files

ESM hoists static `import` statements — they execute BEFORE `process.env` assignments. Always use `await import()` for project source files (`../code/src/...`). Only use static `import` for third-party libraries (`bun:test`, `elysia`, `mongodb`, `jose`).

```typescript
// CORRECT
const { authRoutes } = await import('../code/src/routes/auth.mts')
// WRONG — hoisted before env vars
import { authRoutes } from '../code/src/routes/auth.mts'
```
