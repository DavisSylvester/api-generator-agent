# Bun Reference

> Runtime, package manager, bundler, and test runner for all projects on this machine.
> See also: [Bun official docs](https://bun.sh/docs)

---

## Runtime & Toolchain

- **Runtime**: Bun (not Node.js, not ts-node)
- **Package manager**: Bun — never `npm`, `yarn`, or `pnpm`
- **Test runner**: `bun test` — never jest, vitest, or mocha
- **Bundler**: `bun build` — not webpack or esbuild directly

---

## Package Management

```bash
bun add <package>          # install dependency
bun add -d <package>       # install dev dependency
bun remove <package>       # uninstall
bun install                # restore all dependencies
bun run <script>           # run package.json script
bun update                 # update dependencies
```

Never use `npm run`, `yarn`, or `pnpm` commands.

---

## Bun Project Structure

- When a user wants to initialize a bun project create the following structure:

  - src
    - config
      - constants.mts
    - ioc
    - interfaces
    - features
    - services
    - repository
    - types
    - index.mts
  - tests
  - docs
  - .env.example
  - Dockerfile
  - readme.md
  - tsconfig.json
  - package.json


`tsconfig.json`
```ts
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    // Some stricter flags (disabled by default)
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
```

## File Extensions & Imports

All source files must use `.mts` for ESM modules. Import specifiers must be explicit:

```ts
// ✅ correct
import { x } from './file.mts'
import { y } from '../utils/helpers.mts'

// ❌ avoid — omitting extension
import { x } from './file'
```

---

## Execution & Dev Workflow

```bash
bun run src/index.mts          # run directly — no compile step
bun --watch src/index.mts      # dev mode with auto-reload
bun build src/index.mts --outdir dist   # bundle for production
```

Never use `ts-node`, `tsx`, or `tsc --watch` — Bun handles all of this natively.

---

## Bun-Native APIs

Prefer Bun's built-in APIs over Node.js equivalents:

| Prefer                      | Instead of                  |
|-----------------------------|-----------------------------|
| `Bun.file(path)`            | `fs.readFile`               |
| `Bun.write(path, data)`     | `fs.writeFile`              |
| `Bun.serve({ fetch })`      | `http.createServer`         |
| `Bun.password.hash()`       | `bcrypt`                    |
| `$` from `bun shell`        | `child_process.exec`        |
| `Bun.env.KEY`               | `process.env.KEY`           |
| `Bun.sleep(ms)`             | `setTimeout` promise wrap   |
| `Bun.hash()`                | manual hashing utilities    |

### File I/O Example

```ts
// Reading
const file = Bun.file('data.json')
const data = await file.json()

// Writing
await Bun.write('output.json', JSON.stringify(data, null, 2))
```

### HTTP Server Example

```ts
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('OK')
  },
})
```

### Shell Scripting

```ts
import { $ } from 'bun'

const output = await $`ls -la`.text()
```

---

## Environment Variables

- Access via `Bun.env.KEY` (or `process.env.KEY` — both work)
- **Never access env vars directly in app code** — always go through `src/env.mts`
- Validate at startup using TypeBox:

```ts
// src/env.mts
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

---

## Testing

Use `bun test` — it's Jest-compatible with no additional packages needed.

```ts
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'

describe('MyService', () => {

  beforeAll(async () => {
    // setup
  })

  afterAll(async () => {
    // teardown
  })

  it('should do something', () => {
    expect(1 + 1).toBe(2)
  })

})
```

### Test File Conventions

- Files: `*.test.mts` or `*.spec.mts`
- Location: `apps/<app>/tests/<domain>/*.test.mts`
- Always use setup/teardown fixtures for DB or service state
- Run tests: `bun test` or `bun test --watch`

### Mocking

```ts
import { mock, spyOn } from 'bun:test'

const mockFn = mock(() => 'mocked')
const spy = spyOn(myObject, 'method')
```

---

## TypeScript Configuration

Use `bun-types` — do **not** install `@types/node`:

```bash
bun add -d bun-types
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## What NOT to Do

| Don't                             | Do instead                      |
|-----------------------------------|---------------------------------|
| `npm install` / `yarn add`        | `bun add`                       |
| `npm run dev`                     | `bun run dev`                   |
| `ts-node`, `tsx`, `tsc --watch`   | `bun run` / `bun --watch`       |
| `require()` / CommonJS patterns   | `import` / ESM always           |
| `@types/node`                     | `bun-types`                     |
| `process.exit()` in library code  | Only in CLI entrypoints         |
| `console.log` for logging         | Use shared structured logger    |
| Direct `process.env` access       | Use typed `src/env.mts` module  |