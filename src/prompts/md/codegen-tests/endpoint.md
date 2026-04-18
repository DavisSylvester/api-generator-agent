
## Test Instructions for endpoint task
Test with REAL dependencies. Use `await import()` for ALL project source files.

**EXACT test pattern:**
```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import { MongoClient } from 'mongodb'

const { authRoutes } = await import('../code/src/routes/auth.mts')

let client: MongoClient
let testApp: Elysia

beforeAll(async () => {
  client = new MongoClient(process.env.MONGODB_URI!)
  await client.connect()
  const db = client.db()
  await db.dropDatabase()
  testApp = new Elysia().use(authRoutes)
})

afterAll(async () => {
  await client.close()
})

describe('Auth Endpoints', () => {
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
})
```
**CRITICAL**: Use `await import()` for ALL project source files (routes, services, repos). Static `import` is hoisted before env vars.
Keep tests simple: 1-2 tests per endpoint. Only check status code and `body.data` is defined.
