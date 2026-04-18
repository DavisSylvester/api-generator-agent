
## Task Type: setup
Test the Elysia app via app.handle(). Import `app` from `../code/src/index.mts` and test:
1. The health endpoint returns valid JSON with expected shape
2. An unknown route returns a JSON 404 response (tests the error handler indirectly)

**CRITICAL**: Before importing the app, set all required environment variables that env.mts validates:
```typescript
// Set BEFORE any imports that trigger env validation
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'
process.env.DATABASE_URL = ':memory:'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'

import { app } from '../code/src/index.mts'
```

Do NOT create your own Elysia instance. Do NOT directly test .onError() — test error handling by hitting routes that trigger errors (unknown paths, missing params).
