# endpoint-auth Knowledge Base

## Auth middleware must use .as('plugin')

If the auth middleware doesn't include `.as('plugin')`, all protected routes will return 200 instead of 401 for missing/invalid tokens. Check that the imported authMiddleware ends with `.as('plugin')`.

## Test pattern for auth endpoints

Auth endpoints (register, login) don't require the auth middleware — they're public. Test them without tokens:

```typescript
it('should register a user', async () => {
  const res = await testApp.handle(new Request('http://localhost/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', name: 'Test', password: 'password123' }),
  }))
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.data).toBeDefined()
})
```

Keep assertions simple: status code + `body.data` is defined. Do NOT check specific field values in the response body.

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
