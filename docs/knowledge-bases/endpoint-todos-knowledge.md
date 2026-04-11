# endpoint-todos Knowledge Base

## "export 'Result' not found in './result.mts'"

The `Result` type in `src/types/result.mts` MUST be defined with runtime helper functions, not as `export type`. Bun strips type-only exports at runtime.

**CORRECT result.mts:**
```typescript
interface Success<T> { readonly ok: true; readonly value: T }
interface Failure<E> { readonly ok: false; readonly error: E }
type Result<T, E = Error> = Success<T> | Failure<E>

function ok<T>(value: T): Success<T> { return { ok: true, value } }
function err<E>(error: E): Failure<E> { return { ok: false, error } }

export { ok, err, Result }
```

**WRONG result.mts (breaks at runtime):**
```typescript
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
// ^ type-only export — erased by Bun, causes "export 'Result' not found"
```

## Auth middleware must use .as('plugin')

See middleware-auth knowledge base.

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
