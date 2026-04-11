# integration-main Knowledge Base

## This task wires all route plugins into src/index.mts

The integration-main task ONLY generates:
1. `src/index.mts` — imports and `.use()` all route plugins
2. `src/db.mts` — MongoDB connection (if not already present)

It does NOT generate services, repositories, or endpoint files — those come from upstream tasks.

## Common failure: import/export mismatches with upstream code

Integration-main depends on ALL upstream tasks. If any upstream task exported a different name than expected, this task gets stuck in import validation and never reaches QA.

**Rule:** Before importing anything, check what the dependency files ACTUALLY export. Do NOT assume export names — use the exact names shown in the "Available Code from Dependencies" section.

## Export name mismatches

Upstream endpoint tasks may export factory functions (`buildDiscountRoutes`) instead of plugin constants (`discountsRoutes`). Always match the ACTUAL export name:

```typescript
// Check what the file actually exports, then use THAT name
// If discounts.mts exports buildDiscountRoutes:
import { buildDiscountRoutes } from './endpoints/discounts.mts'

// Do NOT assume a name like discountsRoutes if the file exports something else
```

## Empty dependency files

If an upstream task wrote code to a non-standard filename (e.g. `discount-repository-source.mts` instead of `discount-repository.mts`), the expected file may be empty. This task cannot fix upstream files.

**Rule:** Only import from files that have actual exports listed in the dependency summary. Skip any imports that reference files with no exports.

## Keep the integration simple

```typescript
import { Elysia } from 'elysia'
// Use await import() for all project files
const { authRoutes } = await import('./endpoints/auth.mts')
const { servicesRoutes } = await import('./endpoints/services.mts')
// ... etc

const app = new Elysia()
  .onError(({ code, error, path, set }) => {
    const statusCode = code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : error?.name === 'UnauthorizedError' ? 401 : 500
    set.status = statusCode
    return { statusCode, message: error?.message ?? code, date: new Date().toISOString(), source: path, data: null }
  })
  .get('/health', () => ({ status: 'ok' }))
  .use(authRoutes)
  .use(servicesRoutes)
  // ... mount all route plugins
  .listen(Number(process.env.PORT ?? '3000'))

export { app }
```

## Test pattern

Only test health endpoint and 404 handler. Do NOT test auth or business logic — those were already tested by upstream tasks.

```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'

import { describe, it, expect } from 'bun:test'

const { app } = await import('../code/src/index.mts')

describe('integration', () => {
  it('health check returns ok', async () => {
    const res = await app.handle(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
  })
})
```

## Test files MUST be in tests/ only

Test files are ONLY allowed in the `tests/` folder. NEVER place test files under `code/` or `code/tests/`.

## Use await import() for project source files

ESM hoists static `import` statements — they execute BEFORE `process.env` assignments. Always use `await import()` for project source files (`../code/src/...`). Only use static `import` for third-party libraries (`bun:test`, `elysia`, `mongodb`, `jose`).
