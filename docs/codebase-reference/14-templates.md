# templates/ -- Code Generation Templates

All templates are raw TypeScript functions (`.tmpl.mts`) that return strings. No template engine -- just template literals.

---

## Base Templates (templates/base/)

These 19 templates generate the standard layers of an Elysia API project.

### container.tmpl.mts
**Exports:** `renderContainer(projectName, features)`
**Generates:** `get-container.mts` -- DI container that imports all Repositories and Services, wires them with MongoDB `Db` and Winston `Logger`, returns typed `IContainer`.
**Why:** Every generated API needs centralized dependency wiring.

### docker-compose.tmpl.mts
**Exports:** `renderDockerCompose(projectName)`
**Generates:** `docker-compose.yml` with MongoDB 7, port mapping, volume persistence, healthcheck.
**Why:** Local development database.

### env-config.tmpl.mts
**Exports:** `renderEnvConfig()`, `renderDatabaseConfig()`, `renderEnvExample()`
**Generates:** `env.mts` (TypeBox-validated config singleton), `create-database-configuration.mts`, `.env.example`.
**Why:** Validated environment configuration.

### eslint-config.tmpl.mts
**Exports:** `renderEslintConfig()`
**Generates:** `eslint.config.mjs` with strict TypeScript rules.
**Why:** Code quality standards.

### gitignore.tmpl.mts
**Exports:** `renderGitignore()`
**Generates:** `.gitignore` for Node.js projects.

### health-router.tmpl.mts
**Exports:** `renderHealthRouter()`
**Generates:** `GET /health` route returning `{ status: "ok", timestamp }`.
**Why:** Monitoring endpoint.

### interface.tmpl.mts
**Exports:** `renderInterface()`, `renderCreateDto()`, `renderUpdateDto()`, `renderInterfaceBarrel()`
**Generates:** Entity interface (`IEntity`), create DTO (omits auto-fields), update DTO (all optional), barrel `index.mts`.
**Why:** Type-safe domain model foundation.

### logger.tmpl.mts
**Exports:** `renderLogger(projectName)`
**Generates:** Winston logger factory with JSON + timestamp format.
**Why:** Structured logging.

### package-json.tmpl.mts
**Exports:** `renderPackageJson(projectName)`
**Generates:** `package.json` with Bun scripts and dependencies (elysia, mongodb, typebox, winston, etc.).

### repository.tmpl.mts
**Exports:** `renderRepository()`, `renderRepositoryBarrel()`
**Generates:** MongoDB repository class with `ensureIndexes()`, `create()` (ULID IDs), `findById()`, `findAll()` (pagination), `update()`, `delete()`.
**Why:** Data access layer per entity.

### router.tmpl.mts
**Exports:** `renderRouter()`, `renderRouterBarrel()`
**Generates:** Elysia router with CRUD routes under `/v1/{plural}`: POST, GET list, GET by id, PUT, DELETE. Uses TypeBox validation, standardized responses.
**Why:** HTTP routing layer.

### schema.tmpl.mts
**Exports:** `renderValidationSchema()`, `renderSchemaBarrel()`
**Generates:** TypeBox schemas: `createSchema`, `updateSchema` (all optional), `idParamSchema`, `querySchema`. Plus `Static` types.
**Why:** Schema-first validation at system boundaries.

### server.tmpl.mts
**Exports:** `renderServer(projectName, features)`
**Generates:** Main `index.mts` entry point: Elysia app with CORS, OpenAPI, trace plugin, health endpoint, all feature routers mounted.
**Why:** Application entry point.

### service.tmpl.mts
**Exports:** `renderService()`, `renderServiceInterface()`, `renderServiceBarrel()`
**Generates:** Service class delegating CRUD to repository with logging, service interface, barrel.
**Why:** Business logic layer.

### swagger-detail.tmpl.mts
**Exports:** `renderSwaggerDetail()`
**Generates:** OpenAPI metadata objects and request body schemas per CRUD operation.
**Why:** Enriched Swagger documentation.

### test.tmpl.mts
**Exports:** `renderServiceTest()`, `renderIntegrationTest()`
**Generates:** Unit tests (mocked repos) and integration tests (real HTTP calls) using `bun:test`.
**Why:** Automated correctness verification.

### trace-plugin.tmpl.mts
**Exports:** `renderTracePlugin()`
**Generates:** Elysia plugin assigning ULID `traceId` per request, logging request/response/errors.
**Why:** Request tracing for observability.

### tsconfig.tmpl.mts
**Exports:** `renderTsconfig()`
**Generates:** `tsconfig.json` with ESNext, Bun-compatible settings, strict mode.

### version-router.tmpl.mts
**Exports:** `renderVersionRouter()`
**Generates:** `GET /version` endpoint returning project name, version, timestamp.
**Why:** Deployment verification.

---

## Addon Templates (templates/addons/)

All six addons implement the `ITemplate` interface with `plan()`, `render()`, `validate()` methods.

### aws-cdk/index.mts
**Generates:** AWS CDK Stack with DynamoDB (PAY_PER_REQUEST), SQS + DLQ, Lambda (Node 20), API Gateway with CORS/throttling, IAM permissions, `cdk.json` config.
**Why:** Optional AWS infrastructure-as-code.

### azure-terraform/index.mts
**Generates:** Terraform files for Azure: Resource Group, App Service Plan, Linux Web App, Key Vault, Storage Account + Queue, Function Apps. Includes variables.tf, outputs.tf, providers.tf.
**Why:** Optional Azure infrastructure-as-code.

### external-api-client/index.mts
**Generates:** Typed HTTP client: `IApiClient` interface, `HttpApiClient` with retry and timeout, `DefaultResponseMapper`.
**Why:** Reusable pattern for calling external APIs.

### queue-consumer/index.mts
**Generates:** Queue consumer pattern: `IMessageHandler`, `QueueListenerService`, `InMemoryDeadLetterService`, `RetryHandler` with exponential backoff.
**Why:** Message-driven architecture addon.

### teams-notification/index.mts
**Generates:** Teams webhook: `TeamsMessageBuilder` (fluent API), `TeamsWebhookClient` (retry), notification templates for deploy/error/health events.
**Why:** CI/CD and monitoring notifications.

### timer-job/index.mts
**Generates:** Scheduled job pattern: `IScheduledJob`, `SchedulerService` with history, cron config with `COMMON_SCHEDULES` and human-readable descriptions.
**Why:** Periodic background tasks.
