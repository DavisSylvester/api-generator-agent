# middleware-auth Knowledge Base

## CRITICAL: Must use .as('plugin') on auth middleware

Without `.as('plugin')`, Elysia scopes guard/resolve to the plugin only. Routes defined AFTER `.use(authMiddleware)` will NOT have the guard/resolve applied — they'll return 200 instead of 401.

**CORRECT pattern:**
```typescript
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .error({ UNAUTHORIZED: UnauthorizedError })
  .onError(({ error, set, path }) => {
    if (error instanceof UnauthorizedError) {
      set.status = 401
      return { statusCode: 401, message: error.message, date: new Date().toISOString(), source: path, data: null }
    }
  })
  .guard({ headers: t.Object({ authorization: t.String() }) })
  .resolve(async ({ headers }) => {
    // ... JWT verification
    return { userId: payload.sub as string }
  })
  .as('plugin')  // <-- REQUIRED! Makes guard/resolve apply to parent routes
```

**Without .as('plugin'):** test expects 401, gets 200. The guard/resolve never runs on parent routes.

## Test pattern

Keep tests to exactly 2 cases:
1. No token → 401
2. Valid token → 200, body.userId is defined

Do NOT test expired tokens, malformed tokens, or response body message fields.

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
