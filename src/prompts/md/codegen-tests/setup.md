
## Test Instructions for setup task
**EXACT test pattern (follow precisely):**
```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'

import { describe, it, expect } from 'bun:test'

const { app } = await import('../code/src/index.mts')

describe('setup-foundation', () => {
  it('should return health status', async () => {
    const res = await app.handle(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('should return JSON 404 for unknown routes', async () => {
    const res = await app.handle(new Request('http://localhost/nonexistent'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.statusCode).toBe(404)
  })
})
```
**CRITICAL**: Use `await import()` for project files — static `import` is hoisted before env vars. Only use static `import` for `bun:test`.
**Do NOT test the date field** — it causes flaky failures.
