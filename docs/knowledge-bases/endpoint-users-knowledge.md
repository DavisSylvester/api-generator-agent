# endpoint-users Knowledge Base

## Routes return 404 — check plugin prefix and mounting

If all routes return 404, the route plugin prefix doesn't match the test URL. Ensure:
1. Plugin uses `new Elysia({ prefix: '/api/v1/users' })`
2. Test request hits `http://localhost/api/v1/users/me`
3. The test mounts the plugin: `new Elysia().use(usersRoutes)`

## Auth middleware must use .as('plugin')

If auth tests return 200 instead of 401, the middleware is missing `.as('plugin')`. See middleware-auth knowledge base.

## Keep test assertions simple

Only check status code and that `body.data` is defined. Do NOT check specific user fields.

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
