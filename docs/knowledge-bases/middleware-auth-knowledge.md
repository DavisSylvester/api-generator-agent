# middleware-auth Knowledge Base

## CRITICAL: Must use .as('plugin') on auth middleware

Without `.as('plugin')`, Elysia scopes guard/resolve to the plugin only. Routes defined AFTER `.use(authMiddleware)` will NOT have the guard/resolve applied — they'll return 200 instead of 401.

## CRITICAL: Do NOT validate JWT payload against full entity schemas

The JWT token only contains `sub` (user/tenant ID), `exp`, `iat` — NOT the full entity document. Do NOT use `Value.Check(TenantSchema, ...)` or `Value.Check(UserSchema, ...)` on the decoded JWT payload. It will always fail because the JWT doesn't have fields like `name`, `email`, `businessName`, etc.

**WRONG — causes 401 on valid tokens:**
```typescript
const { payload } = await jwtVerify(token, secret)
const tenant = { id: payload.sub }
if (!Value.Check(TenantSchema, tenant)) {  // FAILS — JWT doesn't have name, email, etc.
  throw new UnauthorizedError('Invalid token payload')
}
```

**CORRECT — just extract the ID from sub:**
```typescript
const { payload } = await jwtVerify(token, secret)
const userId = payload.sub as string
if (!userId) {
  throw new UnauthorizedError('Invalid token: missing sub claim')
}
return { userId }
```

## CRITICAL: Handle missing Authorization header as 401, not 500

When `.guard({ headers: t.Object({ authorization: t.String() }) })` fails because the header is missing, Elysia throws a VALIDATION error — NOT an UnauthorizedError. The middleware's `.onError()` must also handle VALIDATION errors on the authorization header as 401:

**CORRECT .onError() pattern:**
```typescript
.onError(({ code, error, set, path }) => {
  if (error instanceof UnauthorizedError || code === 'VALIDATION') {
    set.status = 401
    return {
      statusCode: 401,
      message: error instanceof UnauthorizedError ? error.message : 'Authorization required',
      date: new Date().toISOString(),
      source: path,
      data: null,
    }
  }
})
```

**WRONG — only handles UnauthorizedError, missing header returns 500:**
```typescript
.onError(({ error, set, path }) => {
  if (error instanceof UnauthorizedError) {  // Missing header is VALIDATION error, not caught here!
    set.status = 401
    ...
  }
})
```

## Complete CORRECT middleware pattern

```typescript
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')

export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .error({ UNAUTHORIZED: UnauthorizedError })
  .onError(({ code, error, set, path }) => {
    if (error instanceof UnauthorizedError || code === 'VALIDATION') {
      set.status = 401
      return {
        statusCode: 401,
        message: error instanceof UnauthorizedError ? error.message : 'Authorization required',
        date: new Date().toISOString(),
        source: path,
        data: null,
      }
    }
  })
  .guard({
    headers: t.Object({
      authorization: t.String(),
    }),
  })
  .resolve(async ({ headers }) => {
    const auth = headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing Bearer token')
    }
    try {
      const token = auth.split(' ')[1]!
      const { payload } = await jwtVerify(token, secret)
      const userId = payload.sub as string
      if (!userId) {
        throw new UnauthorizedError('Invalid token: missing sub claim')
      }
      return { userId }
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e
      throw new UnauthorizedError('Invalid or expired token')
    }
  })
  .as('plugin')
```

## Test pattern

Keep tests to exactly 2 cases:
1. No token → 401
2. Valid token → 200, body.userId is defined

Do NOT test expired tokens, malformed tokens, or response body message fields.

## Test files MUST be in tests/ only

Test files are ONLY allowed in the `tests/` folder. NEVER place test files under `code/` or `code/tests/`.

## Use await import() for project source files

ESM hoists static `import` statements — they execute BEFORE `process.env` assignments. Always use `await import()` for project source files (`../code/src/...`). Only use static `import` for third-party libraries (`bun:test`, `elysia`, `mongodb`, `jose`).

```typescript
// CORRECT
const { authMiddleware } = await import('../code/src/middleware/auth-guard.mts')
// WRONG — hoisted before env vars
import { authMiddleware } from '../code/src/middleware/auth-guard.mts'
```
