function getTaskTypeTestInstructions(taskType?: string): string {
  switch (taskType) {
    case `setup`:
      return `\n## Test Instructions for setup task\n**EXACT test pattern (follow precisely):**\n\`\`\`typescript\nprocess.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'\nprocess.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'\nprocess.env.NODE_ENV = 'test'\nprocess.env.PORT = '0'\n\nimport { describe, it, expect } from 'bun:test'\n\nconst { app } = await import('../code/src/index.mts')\n\ndescribe('setup-foundation', () => {\n  it('should return health status', async () => {\n    const res = await app.handle(new Request('http://localhost/health'))\n    expect(res.status).toBe(200)\n    const body = await res.json()\n    expect(body.status).toBe('ok')\n  })\n\n  it('should return JSON 404 for unknown routes', async () => {\n    const res = await app.handle(new Request('http://localhost/nonexistent'))\n    expect(res.status).toBe(404)\n    const body = await res.json()\n    expect(body.statusCode).toBe(404)\n  })\n})\n\`\`\`\n**CRITICAL**: Use \`await import()\` for project files — static \`import\` is hoisted before env vars. Only use static \`import\` for \`bun:test\`.\n**Do NOT test the date field** — it causes flaky failures.\n`;
    case `model`:
      return `\n## Test Instructions for model task\nWrite pure unit tests. Use \`await import()\` for project source files.\n\n**EXACT test pattern:**\n\`\`\`typescript\nimport { describe, it, expect } from 'bun:test'\nimport { Value } from '@sinclair/typebox/value'\n\nconst { UserSchema, RegisterInput } = await import('../code/src/types/user.mts')\n\ndescribe('User Schemas', () => {\n  it('validates a complete document', () => {\n    expect(Value.Check(UserSchema, { _id: '1', email: 'a@b.com', name: 'Test', passwordHash: 'x', createdAt: '', updatedAt: '' })).toBe(true)\n  })\n  it('rejects empty object', () => {\n    expect(Value.Check(UserSchema, {})).toBe(false)\n  })\n})\n\`\`\`\n**CRITICAL — do NOT test these (they cause infinite fix loops):**\n- Do NOT test email regex/pattern validation\n- Do NOT use \`.toContain()\` on error messages\n- Only assert: \`Value.Check(schema, validData)\` is true, \`Value.Check(schema, {})\` is false\n`;
    case `repository`:
      return `\n## Test Instructions for repository task\nTest against a REAL MongoDB instance (Docker). Use \`await import()\` for project source files.\n\n**EXACT test pattern:**\n\`\`\`typescript\nprocess.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'\nprocess.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'\nprocess.env.NODE_ENV = 'test'\n\nimport { describe, it, expect, beforeAll, afterAll } from 'bun:test'\nimport { MongoClient } from 'mongodb'\n\nconst { UserRepository } = await import('../code/src/repositories/user-repository.mts')\n\nlet client: MongoClient\nlet repo: InstanceType<typeof UserRepository>\n\nbeforeAll(async () => {\n  client = new MongoClient(process.env.MONGODB_URI!)\n  await client.connect()\n  const db = client.db()\n  await db.dropDatabase()\n  repo = new UserRepository(db)\n})\n\nafterAll(async () => {\n  await client.close()\n})\n\ndescribe('UserRepository', () => {\n  it('should create and find a user', async () => {\n    const result = await repo.create('test@example.com', 'Test User', 'hash123')\n    expect(result.ok).toBe(true)\n    if (result.ok) {\n      expect(result.value).toBeDefined()\n    }\n  })\n})\n\`\`\`\n**CRITICAL**: Use \`await import()\` for project files. Static \`import\` is hoisted before env vars.\nKeep tests simple: 2-3 CRUD operations max.\n`;
    case `service`:
      return `\n## Test Instructions for service task\nTest with REAL MongoDB and real repository instances. Use \`await import()\` for project source files.\n\n**EXACT test pattern:**\n\`\`\`typescript\nprocess.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'\nprocess.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'\nprocess.env.NODE_ENV = 'test'\n\nimport { describe, it, expect, beforeAll, afterAll } from 'bun:test'\nimport { MongoClient } from 'mongodb'\n\nconst { UserRepository } = await import('../code/src/repositories/user-repository.mts')\nconst { AuthService } = await import('../code/src/services/auth-service.mts')\n\nlet client: MongoClient\nlet service: InstanceType<typeof AuthService>\n\nbeforeAll(async () => {\n  client = new MongoClient(process.env.MONGODB_URI!)\n  await client.connect()\n  const db = client.db()\n  await db.dropDatabase()\n  const repo = new UserRepository(db)\n  service = new AuthService(repo)\n})\n\nafterAll(async () => {\n  await client.close()\n})\n\ndescribe('AuthService', () => {\n  it('should register a new user', async () => {\n    const result = await service.register('test@example.com', 'Test User', 'password123')\n    expect(result.ok).toBe(true)\n  })\n\n  it('should reject login with wrong password', async () => {\n    const result = await service.login('test@example.com', 'wrongpassword')\n    expect(result.ok).toBe(false)\n  })\n})\n\`\`\`\n**CRITICAL**: Use \`await import()\` for project files. NEVER use .toContain() on error messages. 2-3 simple tests max.\n`;
    case `endpoint`:
      return `\n## Test Instructions for endpoint task\nTest with REAL dependencies. Use \`await import()\` for ALL project source files.\n\n**EXACT test pattern:**\n\`\`\`typescript\nprocess.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'\nprocess.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'\nprocess.env.NODE_ENV = 'test'\nprocess.env.PORT = '0'\n\nimport { describe, it, expect, beforeAll, afterAll } from 'bun:test'\nimport { Elysia } from 'elysia'\nimport { MongoClient } from 'mongodb'\n\nconst { authRoutes } = await import('../code/src/routes/auth.mts')\n\nlet client: MongoClient\nlet testApp: Elysia\n\nbeforeAll(async () => {\n  client = new MongoClient(process.env.MONGODB_URI!)\n  await client.connect()\n  const db = client.db()\n  await db.dropDatabase()\n  testApp = new Elysia().use(authRoutes)\n})\n\nafterAll(async () => {\n  await client.close()\n})\n\ndescribe('Auth Endpoints', () => {\n  it('should register a user', async () => {\n    const res = await testApp.handle(new Request('http://localhost/api/v1/auth/register', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ email: 'test@example.com', name: 'Test', password: 'password123' }),\n    }))\n    expect(res.status).toBe(201)\n    const body = await res.json()\n    expect(body.data).toBeDefined()\n  })\n})\n\`\`\`\n**CRITICAL**: Use \`await import()\` for ALL project source files (routes, services, repos). Static \`import\` is hoisted before env vars.\nKeep tests simple: 1-2 tests per endpoint. Only check status code and \`body.data\` is defined.\n`;
    case `middleware`:
      return `\n## Test Instructions for middleware task\nUse \`await import()\` for project source files. Set env vars BEFORE dynamic imports.\n\n**EXACT test pattern:**\n\`\`\`typescript\nprocess.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long!!'\nprocess.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/test-db'\nprocess.env.NODE_ENV = 'test'\n\nimport { describe, it, expect } from 'bun:test'\nimport { Elysia } from 'elysia'\nimport { SignJWT } from 'jose'\n\nconst { authMiddleware } = await import('../code/src/middleware/auth-guard.mts')\n\nconst secret = new TextEncoder().encode(process.env.JWT_SECRET!)\n\nasync function makeToken(sub: string): Promise<string> {\n  return new SignJWT({ sub })\n    .setProtectedHeader({ alg: 'HS256' })\n    .setExpirationTime('1h')\n    .sign(secret)\n}\n\nconst testApp = new Elysia()\n  .use(authMiddleware)\n  .get('/protected', ({ userId }) => ({ userId }))\n\ndescribe('auth middleware', () => {\n  it('should return 401 without token', async () => {\n    const res = await testApp.handle(new Request('http://localhost/protected'))\n    expect(res.status).toBe(401)\n  })\n\n  it('should return 200 with valid token', async () => {\n    const token = await makeToken('user-123')\n    const res = await testApp.handle(new Request('http://localhost/protected', {\n      headers: { authorization: \`Bearer \${token}\` },\n    }))\n    expect(res.status).toBe(200)\n    const body = await res.json()\n    expect(body.userId).toBeDefined()\n  })\n})\n\`\`\`\n**CRITICAL**: Use \`await import()\` for project files. Static \`import\` is hoisted before env vars.\nOnly 2 tests: 401 (no token) and 200 (valid token).\n`;
    default:
      return ``;
  }
}

export function createCodegenUserPrompt(
  taskName: string,
  taskDescription: string,
  existingCode?: string,
  taskType?: string,
  taskId?: string,
): string {
  let prompt = `## Task: ${taskName}`;

  if (taskType) {
    prompt += `\nTask type: ${taskType}`;
  }

  if (taskId) {
    prompt += `\nTask ID: ${taskId} (use this for the test file path: \`tests/${taskId}.test.mts\`)`;
  }

  prompt += `\n\n${taskDescription}`;

  if (taskType && taskType !== `setup`) {
    prompt += `\n\n**IMPORTANT**: This is NOT a setup task. Do NOT generate src/index.mts. Only setup tasks create the Elysia app entry file.`;
  }

  if (taskType === `endpoint`) {
    prompt += `\nEndpoint tasks export Elysia plugins (e.g. \`export const fooRoutes = new Elysia({ prefix: '/api/v1/foo' })...\`). Do NOT call .listen() or create a standalone app.`;
  }

  if (existingCode) {
    prompt += `\n\n## Available Code from Dependencies (DO NOT RECREATE — IMPORT THESE)
The following code was generated by completed dependency tasks. You MUST import types, utilities, and modules from these files instead of recreating them.
For example, if you see \`Result<T, E>\` defined in \`src/types/result.mts\`, import it: \`import { Result } from '../types/result.mts'\`
Do NOT duplicate any types, interfaces, or utilities shown below — doing so causes module conflicts.

${existingCode}`;
  }

  prompt += getTaskTypeTestInstructions(taskType);

  prompt += `\n\nGenerate all required files with complete implementations. Use fenced code blocks with file paths.
Also generate the test file as \`tests/${taskId ?? `task`}.test.mts\`. The test MUST only import names you actually exported.`;

  return prompt;
}
