
## Test Instructions for repository task
Test against a REAL MongoDB instance (Docker). Use `await import()` for project source files.

**EXACT test pattern:**
```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { MongoClient } from 'mongodb'

const { UserRepository } = await import('../code/src/repositories/user-repository.mts')

let client: MongoClient
let repo: InstanceType<typeof UserRepository>

beforeAll(async () => {
  client = new MongoClient(process.env.MONGODB_URI!)
  await client.connect()
  const db = client.db()
  await db.dropDatabase()
  repo = new UserRepository(db)
})

afterAll(async () => {
  await client.close()
})

describe('UserRepository', () => {
  it('should create and find a user', async () => {
    const result = await repo.create('test@example.com', 'Test User', 'hash123')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBeDefined()
    }
  })
})
```
**CRITICAL**: Use `await import()` for project files. Static `import` is hoisted before env vars.
Keep tests simple: 2-3 CRUD operations max.
