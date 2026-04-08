# Elysia API Reference

> Framework for building typed HTTP APIs with Bun.
> See also: [Elysia official docs](https://elysiajs.com/introduction)

---

## Project Structure

```
src/
  index.mts                  # app entrypoint — mounts all routers
  api/
    <domain>/
      router.mts             # route definitions for this domain
      controller.mts         # HTTP handlers (orchestration only)
      service.mts            # business logic
      repository.mts         # data access layer
      dto.mts                # request/response types (or use packages/interfaces)
      schema.mts             # TypeBox validation schemas
  middleware/
    auth.mts                 # authentication guard
    error.mts                # centralized error handler
    logger.mts               # request logging
  env.mts                    # validated environment variables
packages/
  interfaces/                # shared DTOs across apps
  openapi/                   # generated OpenAPI clients
  config/                    # shared config with TypeBox validation
apps/
  <app>/
    tests/
      <domain>/
        *.test.mts
```

---

## Routing

Group endpoints by domain. No mixed-domain files.

```ts
// src/api/users/router.mts
import Elysia from 'elysia'
import { getUserHandler, createUserHandler } from './controller.mts'
import { createUserSchema, getUserSchema } from './schema.mts'

export const usersRouter = new Elysia().group('/users', (app) =>
  app
    .get('/:id', getUserHandler, { params: getUserSchema })
    .post('/', createUserHandler, { body: createUserSchema })
)
```

```ts
// src/index.mts — mount all routers under versioned prefix
import Elysia from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { cors } from '@elysiajs/cors'
import { usersRouter } from './api/users/router.mts'

const app = new Elysia()
  .use(swagger())
  .use(cors({ origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : true }))
  .group('/api/v1', (app) =>
    app
      .use(usersRouter)
  )
  .get('/healthz', () => ({ status: 'ok' }))
  .get('/readyz', checkReadiness)
  .listen(3000)
```

### Naming Conventions

- URL paths: `kebab-case` — `/api/v1/user-profiles`
- Handler functions: verb-noun — `getUser`, `createItem`, `deleteOrder`
- Files: `kebab-case` — `user-profile-router.mts`
- Route versioning: prefix with `/api/v1`; bump major version on breaking changes

---

## Schema-First Validation

Every route must define schemas for `body`, `query`, and `params`. No unvalidated inputs.

```ts
// src/api/users/schema.mts
import { t } from 'elysia'
// Using TypeBox (Elysia native) — via Elysia's re-export `t`
export const createUserSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ pattern: '^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }),
})

export const getUserSchema = t.Object({
  id: t.String(),
})

export const listUsersSchema = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 }), 20),
  offset: t.Optional(t.Number({ minimum: 0 }), 0),
  sort: t.Optional(t.String()),
  filter: t.Optional(t.String()),
})
```

**TypeBox Optional/Default rules:**
- `t.Optional(t.String())` — wraps the type. Never use `{ optional: true }`.
- `t.Optional(t.Number(), 20)` — optional with default value as second arg.
- `Type.Union([...], { default: 'value' })` — default for unions via options object.

---

## Controllers

Controllers handle HTTP only — no business logic, no DB access, no auth checks.

```ts
// src/api/users/controller.mts
import type { Context } from 'elysia'
import type { UserService } from './service.mts'

export const createUserController = (userService: UserService) => ({

  async getUser({ params }: Context): Promise<UserDto> {
    return userService.getById(params.id)
  },

  async createUser({ body }: Context): Promise<UserDto> {
    return userService.create(body)
  },

  async listUsers({ query }: Context): Promise<PaginatedResponse<UserDto>> {
    return userService.list(query)
  },

})
```

**Rules:**
- Resolve all services via DI — never `new ServiceName()` inside a controller
- Return typed DTOs — never return raw DB models or `any`
- No `try/catch` blocks — errors bubble to centralized error middleware
- No auth logic inline — use guards/middleware

---

## Services

Services contain all business logic and orchestrate repositories.

```ts
// src/api/users/service.mts
import type { UserRepository } from './repository.mts'
import type { CreateUserDto, UserDto } from 'packages/interfaces'

export class UserService {

  constructor(private readonly userRepository: UserRepository) {}

  async getById(id: string): Promise<UserDto> {
    const user = await this.userRepository.findById(id)
    if (!user) throw new NotFoundError(`User ${id} not found`)
    return toUserDto(user)
  }

  async create(data: CreateUserDto): Promise<UserDto> {
    const existing = await this.userRepository.findByEmail(data.email)
    if (existing) throw new ConflictError('Email already in use')
    const user = await this.userRepository.create(data)
    return toUserDto(user)
  }

}
```

**Rules:**
- All DB access goes through the repository — never direct DB calls in services
- Inject repositories via constructor — never instantiate directly
- Throw typed domain errors — not generic `Error`
- No HTTP-specific logic (`Response`, status codes) — that belongs in controllers

---

## Repositories

All data layer access goes through repositories. Services never touch the DB directly.

```ts
// src/api/users/repository.mts
import type { Database } from '../../db/types.mts'

export class UserRepository {

  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<UserRecord | null> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) })
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.query.users.findFirst({ where: eq(users.email, email) })
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const [user] = await this.db.insert(users).values(data).returning()
    return user
  }

}
```

**Rules:**
- Repositories handle only data access — no business logic
- Return domain records, not DTOs — transformation belongs in services
- Inject DB connection via constructor

---

## Shared DTOs

Define all request/response types in `packages/interfaces`. Never duplicate type definitions across apps.

```ts
// packages/interfaces/users.mts
export interface UserDto {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface CreateUserDto {
  name: string
  email: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  pageInfo: {
    limit: number
    offset: number
    hasMore: boolean
  }
}
```

---

## Pagination & Filtering

Standardize all list endpoints:

```ts
// Standard query params
{ limit?: number, offset?: number, sort?: string, filter?: string }

// Standard response shape
{
  items: T[],
  total: number,
  pageInfo: { limit: number, offset: number, hasMore: boolean }
}
```

---

## Error Handling

Use centralized error middleware. No inline `try/catch` in controllers.

```ts
// src/middleware/error.mts
import Elysia from 'elysia'

export const errorMiddleware = new Elysia()
  .onError(({ code, error, set }) => {
    if (error instanceof NotFoundError) {
      set.status = 404
      return { code: 'NOT_FOUND', message: error.message, details: null }
    }
    if (error instanceof ConflictError) {
      set.status = 409
      return { code: 'CONFLICT', message: error.message, details: null }
    }
    if (error instanceof ValidationError) {
      set.status = 422
      return { code: 'VALIDATION_ERROR', message: error.message, details: error.details }
    }
    // fallback
    set.status = 500
    return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: null }
  })
```

**Error response shape (always):**
```ts
{ code: string, message: string, details: unknown | null }
```

---

## Authentication & Authorization

Auth must be implemented as middleware or guards — never inline in controllers.

```ts
// src/middleware/auth.mts
import Elysia from 'elysia'

export const authGuard = new Elysia()
  .derive(({ headers }) => {
    const token = headers.authorization?.replace('Bearer ', '')
    if (!token) throw new UnauthorizedError('Missing token')
    const user = verifyToken(token)
    return { user }
  })

// Usage in router
app.use(authGuard).get('/protected', ({ user }) => ({ userId: user.id }))
```

---

## OpenAPI & Documentation

```ts
// Mount swagger — always
import { swagger } from '@elysiajs/swagger'

app.use(swagger({
  documentation: {
    info: { title: 'My API', version: '1.0.0' },
    tags: [{ name: 'users', description: 'User management' }],
  }
}))
```

**Rules:**
- Every route must have an entry in API documentation
- Regenerate `packages/openapi` clients whenever routes change
- Tag routes by domain for organized OpenAPI output

---

## Security

```ts
import { cors } from '@elysiajs/cors'

app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}))
```

- Apply security headers on all apps
- Restrict CORS origins by environment
- Add per-route rate limiting where applicable
- Support idempotency keys on POST create endpoints where applicable

---

## Health Checks

Every service must expose both endpoints:

```ts
app
  .get('/health', () => ({ status: 'ok' }))   // liveness — is the process running?
  .get('/ready', async () => {                  // readiness — can it serve traffic?
    await checkDatabase()
    await checkQueue()
    return { status: 'ready' }
  })
```

---

## Logging

```ts
// src/middleware/logger.mts
import Elysia from 'elysia'
import { randomUUID } from 'crypto'

export const loggerMiddleware = new Elysia()
  .derive(() => ({ correlationId: randomUUID() }))
  .onRequest(({ request, correlationId }) => {
    logger.info({ correlationId, method: request.method, url: request.url }, 'request received')
  })
  .onAfterHandle(({ set, correlationId }) => {
    logger.info({ correlationId, status: set.status }, 'request completed')
  })
```

**Rules:**
- No `console.log` in controllers or services — use the shared structured logger
- Always include request correlation IDs
- Never log sensitive data (passwords, tokens, PII)
