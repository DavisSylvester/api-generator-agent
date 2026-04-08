# TypeBox Migration (2026-04-08)

All generated code prompts and documentation have been migrated from Zod to TypeBox (`@sinclair/typebox`).

## Why TypeBox over Zod

- **Elysia native**: Elysia uses TypeBox internally. The `t` import from `elysia` IS TypeBox. No extra dependency needed for Elysia projects.
- **No extra dependency**: Generated APIs do not need to install `zod` — TypeBox comes free with Elysia.
- **Better runtime performance**: TypeBox compiles schemas to optimized validation functions. Benchmarks show it consistently outperforms Zod for validation throughput.
- **JSON Schema compatible**: TypeBox schemas are valid JSON Schema objects, making them interoperable with OpenAPI tooling out of the box.

## Scope

- All LLM prompts (codegen, planning, QA, documentation, fix) now reference TypeBox instead of Zod.
- All documentation files (`docs/bun.md`, `docs/elysia.md`, `docs/azure.md`) updated.
- Global `CLAUDE.md` updated.
- Internal pipeline config files (`src/config/env.mts`, `src-langgraph/config/env.mts`) still use Zod for their own config validation since TypeBox lacks a direct `.safeParse()` equivalent and Zod works fine for internal tooling.

## Zod to TypeBox Mapping

| Zod                                    | TypeBox                                              |
|----------------------------------------|------------------------------------------------------|
| `import { z } from 'zod'`             | `import { Type, Static } from '@sinclair/typebox'`   |
| `z.object({ ... })`                   | `Type.Object({ ... })`                               |
| `z.string()`                           | `Type.String()`                                      |
| `z.number()`                           | `Type.Number()`                                      |
| `z.boolean()`                          | `Type.Boolean()`                                     |
| `z.array(z.string())`                  | `Type.Array(Type.String())`                          |
| `z.enum(['a', 'b'])`                   | `Type.Union([Type.Literal('a'), Type.Literal('b')])` |
| `z.string().optional()`                | `Type.Optional(Type.String())`                       |
| `z.string().min(1)`                    | `Type.String({ minLength: 1 })`                      |
| `z.string().email()`                   | `Type.String({ format: 'email' })`                   |
| `z.string().url()`                     | `Type.String({ format: 'uri' })`                     |
| `z.number().min(0)`                    | `Type.Number({ minimum: 0 })`                        |
| `z.number().int()`                     | `Type.Integer()`                                     |
| `z.coerce.number()`                    | `Type.Number()` (cast manually with `Number()`)      |
| `z.record(z.string(), z.unknown())`    | `Type.Record(Type.String(), Type.Unknown())`          |
| `z.infer<typeof schema>`              | `Static<typeof schema>`                              |
| `schema.parse(data)`                   | `Value.Check(schema, data)` + cast                   |
| `schema.safeParse(data)`               | `Value.Check(schema, data)` (returns boolean)        |
| `schema.safeParse(data).error`         | `[...Value.Errors(schema, data)]`                    |

## Examples

### Basic Schema Definition

```typescript
import { Type, Static } from '@sinclair/typebox'

const UserSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  age: Type.Optional(Type.Number({ minimum: 0 })),
})

type UserInput = Static<typeof UserSchema>
```

### Validation

```typescript
import { Value } from '@sinclair/typebox/value'

const isValid = Value.Check(UserSchema, data)  // boolean

if (!isValid) {
  const errors = [...Value.Errors(UserSchema, data)]
  // errors is an array of { path, value, message }
}
```

### In Elysia Routes

```typescript
import { Elysia, t } from 'elysia'

// `t` IS TypeBox — no separate import needed
const app = new Elysia()
  .post('/users', async ({ body }) => {
    // body is already validated and typed
    return { data: body }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: 'email' }),
    }),
  })
```

### Env Validation

```typescript
import { Type, Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

const EnvSchema = Type.Object({
  PORT: Type.String({ default: '3000' }),
  DATABASE_URL: Type.String({ format: 'uri' }),
  NODE_ENV: Type.Union([
    Type.Literal('development'),
    Type.Literal('production'),
    Type.Literal('test'),
  ]),
})

type EnvConfig = Static<typeof EnvSchema>

const parsed = Value.Cast(EnvSchema, Bun.env)
if (!Value.Check(EnvSchema, parsed)) {
  const errors = [...Value.Errors(EnvSchema, parsed)]
  throw new Error(`Invalid env: ${errors.map(e => e.message).join(', ')}`)
}

export const env: EnvConfig = parsed
```
