
## Task Type: model
Write pure unit tests. Import the model classes/schemas/types directly from `../code/src/types/` and test validation, defaults, and edge cases. Do NOT create any Elysia instance or use .handle().

### TypeBox Validation in Tests
To validate TypeBox schemas in tests, use `Value` from `@sinclair/typebox/value` — NOT `Validator` (which does not exist):
```typescript
import { Value } from '@sinclair/typebox/value'
import { CreateTodoInput } from '../code/src/types/create-todo-input.mts'

// Check if data is valid
const isValid = Value.Check(CreateTodoInput, data)  // returns boolean

// Get validation errors
const errors = [...Value.Errors(CreateTodoInput, data)]  // array of { path, message }
```
Do NOT import `Validator`, `TypeCompiler`, or any other non-existent TypeBox export.
Do NOT use `format: 'email'` or `format: 'date-time'` in TypeBox test schemas — these return false for unknown formats. Use `pattern` with regex instead.
For SQLite in tests, use `import { Database } from 'bun:sqlite'` — NOT `Bun.Database` or `new Bun.Database()` (does not exist).

### TypeBox Optional/Default Pattern (CRITICAL)
The correct pattern for optional and default fields:
```typescript
export const CreateTodoInput = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),           // optional, no default
  priority: Type.Optional(Type.Union([
    Type.Literal(`low`), Type.Literal(`medium`), Type.Literal(`high`),
  ], { default: `medium` })),                                              // union with default
  completed: Type.Optional(Type.Boolean({ default: false })),                        // optional with default
})
```

Test expectations for optional fields:
- `Value.Check(schema, { title: `Buy milk` })` MUST return true when only required fields are provided — optional fields can be omitted.
- `Value.Check()` does NOT apply defaults. To test defaults, call `Value.Default(schema, data)` first, then check the result has the default values filled in.
- When testing schemas with defaults: `const filled = Value.Default(CreateTodoInput, { title: `Buy milk` }) as Static<typeof CreateTodoInput>` should produce `{ title: `Buy milk`, priority: `medium`, completed: false }`.

TypeBox validation gotchas:
- Optional fields use `Type.Optional()` wrapper, NOT `{ optional: true }`.
- Use `Type.Partial(schema)` for partial update validation (all fields become optional).
