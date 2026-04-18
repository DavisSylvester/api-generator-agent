
## Test Instructions for service task
Test with REAL MongoDB and real repository instances. Use `await import()` for project source files.

**EXACT test pattern:**
```typescript
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'
process.env.NODE_ENV = 'test'

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { MongoClient } from 'mongodb'

const { UserRepository } = await import('../code/src/repositories/user-repository.mts')
const { AuthService } = await import('../code/src/services/auth-service.mts')

let client: MongoClient
let service: InstanceType<typeof AuthService>

beforeAll(async () => {
  client = new MongoClient(process.env.MONGODB_URI!)
  await client.connect()
  const db = client.db()
  await db.dropDatabase()
  const repo = new UserRepository(db)
  service = new AuthService(repo)
})

afterAll(async () => {
  await client.close()
})

describe('AuthService', () => {
  it('should register a new user', async () => {
    const result = await service.register('test@example.com', 'Test User', 'password123')
    expect(result.ok).toBe(true)
  })

  it('should reject login with wrong password', async () => {
    const result = await service.login('test@example.com', 'wrongpassword')
    expect(result.ok).toBe(false)
  })
})
```
**CRITICAL**: Use `await import()` for project files. NEVER use .toContain() on error messages. 2-3 simple tests max.
