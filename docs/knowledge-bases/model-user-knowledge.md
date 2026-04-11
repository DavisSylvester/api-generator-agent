# model-user Knowledge Base

## Do NOT test email regex validation with Value.Check

TypeBox `pattern` regex for email fields is strict. Tests that use `Value.Check(UserSchema, { email: 'test@domain.co' })` may fail because the regex pattern doesn't match all valid email formats.

**Rule:** Model tests should ONLY test:
1. That required fields cause validation failure when missing
2. That a fully valid document passes `Value.Check()`
3. That `Value.Default()` applies defaults correctly

**Do NOT write tests that check specific email format validation** — the regex pattern and test data rarely align.

**GOOD test pattern:**
```typescript
it('validates required fields', () => {
  expect(Value.Check(UserSchema, {})).toBe(false)
  expect(Value.Check(UserSchema, { _id: '1', email: 'a@b.com', name: 'Test', passwordHash: 'x', createdAt: '', updatedAt: '' })).toBe(true)
})
```

**BAD test pattern (causes infinite fix loop):**
```typescript
it('validates email format', () => {
  expect(Value.Check(UserSchema, { email: 'invalid-email' })).toBe(false)  // Passes but...
  expect(Value.Check(UserSchema, { email: 'test@domain.co' })).toBe(true)  // May fail! Regex mismatch
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
