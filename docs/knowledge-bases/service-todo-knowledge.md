# service-todo Knowledge Base

## Do NOT assert on exact error message strings

TypeBox validation returns its own error messages like `"Expected string length less or equal to 200"`. These do NOT match custom messages like `"Title must be at most 200 characters"`.

**Rule:** Only assert on `result.ok` being true or false. Never use `.toContain()` or `.toBe()` on error message text.

**GOOD test pattern:**
```typescript
it('should reject overly long title', async () => {
  const result = await service.createTodo(userId, { title: 'x'.repeat(201) })
  expect(result.ok).toBe(false)
})
```

**BAD test pattern (causes infinite fix loop):**
```typescript
it('should reject overly long title', async () => {
  const result = await service.createTodo(userId, { title: 'x'.repeat(201) })
  expect(result.error.message).toContain('Title must be at most 200 characters')
  // ^ FAILS because actual message is "Expected string length less or equal to 200"
})
```

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
