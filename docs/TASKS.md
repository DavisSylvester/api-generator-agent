# agent-one -- Task Tracking

## Phase 1: Core Engine

### Core Interfaces and Types
- [x] IFeatureSpec, IEntitySpec, IFieldSpec, IRelationship
- [x] IGenerationPlan, IGenerationStep
- [x] ITemplate, IGeneratedFile, IRenderedFile, IValidationResult, IGenerationContext
- [x] ITraceEntry, IToolUse, ITraceError
- [x] IVerificationResult
- [x] GenerationStatus type (as const enum)
- [x] TemplateType enum (base | addon)
- [x] AddonType enum
- [x] Barrel exports (core/index.mts)

### Base CRUD Templates (.tmpl.mts)
- [x] interface.tmpl.mts (renderInterface, renderCreateDto, renderUpdateDto, renderInterfaceBarrel)
- [x] schema.tmpl.mts (renderValidationSchema, renderSchemaBarrel)
- [x] repository.tmpl.mts (renderRepository, renderRepositoryBarrel)
- [x] service.tmpl.mts (renderService, renderServiceInterface, renderServiceBarrel)
- [x] router.tmpl.mts (renderRouter, renderRouterBarrel)
- [x] swagger-detail.tmpl.mts (renderSwaggerDetail)
- [x] test.tmpl.mts (renderServiceTest, renderIntegrationTest)
- [x] container.tmpl.mts (renderContainer)
- [x] server.tmpl.mts (renderServer)
- [x] env-config.tmpl.mts (renderEnvConfig, renderDatabaseConfig, renderEnvExample)
- [x] docker-compose.tmpl.mts (renderDockerCompose)
- [x] health-router.tmpl.mts (renderHealthRouter)
- [x] version-router.tmpl.mts (renderVersionRouter)
- [x] trace-plugin.tmpl.mts (renderTracePlugin)
- [x] logger.tmpl.mts (renderLogger)
- [x] package-json.tmpl.mts (renderPackageJson)
- [x] tsconfig.tmpl.mts (renderTsconfig)
- [x] eslint-config.tmpl.mts (renderEslintConfig)
- [x] gitignore.tmpl.mts (renderGitignore)

### Generation Engine
- [x] TemplateRegistry (layer-based rendering, infrastructure rendering)
- [x] GenerationEngine (orchestrates full generation, per-feature generation)
- [x] Barrel exports (generation/index.mts)

### Verification Pipeline
- [x] ESLint gate (eslint-gate.mts)
- [x] Test gate (test-gate.mts)
- [x] Smoke gate (smoke-gate.mts)
- [x] Verification pipeline orchestrator (pipeline.mts)

### Trace Logger
- [x] TraceLogger (session tracking, step tracking, summary)
- [x] TraceStep (tool uses, errors, tokens, file tracking, documentation)
- [x] TraceWriterFs (write .docs/ markdown files)
- [x] TraceWriterMongo (write to MongoDB collection)

### Git Operations
- [x] GitOps (init, addAll, commit, commitFeature, rollback, getLastCommitHash)

### Output
- [x] FileWriter (write rendered files to disk)
- [x] ConsoleReporter (progress reporting)

### Input Parsing
- [x] prompt-parser.mts (extract features from NL prompt)
- [x] prd-parser.mts (parse PRD markdown with checkboxes)

### State Management (pre-existing, enhanced)
- [x] FeaturesStore (features.json read/write/update)
- [x] SessionStore (session handoff doc generation)

### Tests
- [x] Core interfaces compile tests
- [x] Core enums tests
- [x] Interface template tests
- [x] Schema template tests
- [x] Repository template tests
- [x] Service template tests
- [x] Router template tests
- [x] Infrastructure template tests
- [x] Template registry tests
- [x] Generation engine tests (end-to-end file generation)
- [x] L3 compilation tests (3 domain fixtures)
- [x] Trace logger tests
- [x] Trace writer filesystem tests
- [x] File writer tests
- [x] Git ops tests
- [x] Prompt parser tests
- [x] PRD parser tests

## Phase 2: PRD Workflow and State Management
- [ ] PRD interviewer (interactive question flow)
- [ ] Generation planner (dependency resolution + ordering)
- [ ] Human review checkpoint integration

## Phase 3: Verification and Observability
- [ ] Playwright visual verification of Swagger UI
- [ ] End-of-session summary report generator

## Phase 4: Addons and Extensibility
- [ ] Template registry with filesystem-based discovery
- [ ] Azure Terraform addon template
- [ ] AWS CDK addon template

## Phase 5: CLI and Distribution
- [ ] Custom CLI arg parser
- [ ] Claude Code custom agent bridge (agent-bridge.mts)
- [ ] --dry-run flag
