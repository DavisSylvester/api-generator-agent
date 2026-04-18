
## Test Instructions for middleware task
Use `await import()` for project source files. Set env vars BEFORE dynamic imports.

**EXACT test pattern:**
```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'

import { describe, it, expect } from 'bun:test'
import { Elysia } from 'elysia'
import { SignJWT } from 'jose'

const { authMiddleware } = await import('../code/src/middleware/auth-guard.mts')

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

async function makeToken(sub: string): Promise<string> {
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret)
}

const testApp = new Elysia()
  .use(authMiddleware)
  .get('/protected', ({ userId }) => ({ userId }))

describe('auth middleware', () => {
  it('should return 401 without token', async () => {
    const res = await testApp.handle(new Request('http://localhost/protected'))
    expect(res.status).toBe(401)
  })

  it('should return 200 with valid token', async () => {
    const token = await makeToken('user-123')
    const res = await testApp.handle(new Request('http://localhost/protected', {
      headers: { authorization: `Bearer ${token}` },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBeDefined()
  })
})
```
**CRITICAL**: Use `await import()` for project files. Static `import` is hoisted before env vars.
Only 2 tests: 401 (no token) and 200 (valid token).
