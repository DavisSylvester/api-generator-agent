
## Test Instructions for model task
Write pure unit tests. Use `await import()` for project source files.

**EXACT test pattern:**
```typescript
import { describe, it, expect } from 'bun:test'
import { Value } from '@sinclair/typebox/value'

const { UserSchema, RegisterInput } = await import('../code/src/types/user.mts')

describe('User Schemas', () => {
  it('validates a complete document', () => {
    expect(Value.Check(UserSchema, { _id: '1', email: 'a@b.com', name: 'Test', passwordHash: 'x', createdAt: '', updatedAt: '' })).toBe(true)
  })
  it('rejects empty object', () => {
    expect(Value.Check(UserSchema, {})).toBe(false)
  })
})
```
**CRITICAL — do NOT test these (they cause infinite fix loops):**
- Do NOT test email regex/pattern validation
- Do NOT use `.toContain()` on error messages
- Only assert: `Value.Check(schema, validData)` is true, `Value.Check(schema, {})` is false
