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

## Never throw from module-load on missing env

The generated service MUST NOT read `process.env.AAD_*` / `process.env.AUTH0_*` /
`process.env.GRAPH_*` at module-load time. If the service throws on missing env
during import, it blows up EVERY downstream test with:

```
ReferenceError: Cannot access 'createXRoutes' before initialization.
```

This cascades from a single failed module evaluation and looks like a TDZ
bug to the fix-loop — but no amount of iteration will resolve it because the
emitted code is correct; the problem is the evaluation-order throw.

**Emit services this way instead:**

```typescript
// service-auth.mts — CORRECT
export interface AuthServiceConfig {
  readonly aadIssuer: string
  readonly aadJwksUri: string
  readonly aadAudience: string
  readonly auth0Issuer: string
  // ...
}

export const createAuthService = (config: AuthServiceConfig): IAuthService => {
  // validation happens INSIDE the factory, called from DI at app boot
  if (config.aadIssuer.length === 0) {
    throw new Error('AAD_ISSUER is required')
  }
  return new AuthService(config)
}
```

```typescript
// service-auth.mts — WRONG (causes TDZ cascades)
const AAD_ISSUER = process.env.AAD_ISSUER
if (!AAD_ISSUER) throw new Error('AAD_ISSUER is required')  // ← throws at import
export class AuthService { /* uses AAD_ISSUER */ }
```

The DI container (`di-container` task) resolves `process.env` once and passes
a config object into each factory. That way:

- Test files can `createAuthService({ aadIssuer: 'stub', ... })` with stubs.
- Production boots surface a clean startup error instead of a TDZ cascade.
- The QA harness's `TEST_ENV_STUBS` becomes a belt-and-suspenders safety net,
  not a hard requirement.
