# Complete Folder Structure

Annotated directory tree of the entire project.

```
api-generator-agent/
|
|-- .ai/                              # ODA agent activity logs
|   |-- planning/agent-one/prd.md     # Meta-PRD for agent development
|   |-- activity/agent-one/           # Worker-Reviewer logs per task
|       |-- TASK-001/                 # Codegen prompt update
|       |-- TASK-002/                 # Planning prompt update
|       |-- TASK-003/                 # FeaturesStore implementation
|       |-- TASK-004/                 # SessionStore + integration
|
|-- .claude/                          # Claude Code project settings
|   |-- settings.local.json           # Allowed commands and permissions
|   |-- scheduled_tasks.lock          # Lock file for scheduled tasks
|
|-- .doc/                             # Internal project documentation
|   |-- agent-flow.md                 # Exhaustive pipeline flow docs
|   |-- upcoming-features.md          # Development roadmap
|   |-- graphs/                       # Multi-format architecture diagrams
|   |   |-- 01-pipeline-flowchart.md
|   |   |-- 02-swimlane-diagram.md
|   |   |-- 03-architecture-diagram.md
|   |-- history/                      # Project evolution records
|       |-- 00-overview.md            # Timeline: Run 1 (60%) to Run 17 (100%)
|       |-- 01-bugs-and-fixes.md      # All 23 bugs across 17 runs
|       |-- 02-architecture-decisions.md  # 8 architecture decision records
|       |-- 03-knowledge-bases.md     # KB system documentation
|       |-- 04-fallback-system.md     # Multi-tier model fallback docs
|       |-- 05-run-by-run.md          # Detailed results per run
|       |-- 06-model-usage-and-costs.md   # Token/cost analysis
|
|-- .github/workflows/ci.yml         # GitHub Actions: TypeScript type-check
|
|-- docs/                             # Public documentation
|   |-- codebase-reference/           # THIS documentation set
|   |-- architecture-overview.md      # System architecture reference
|   |-- getting-started.md            # First-time user tutorial
|   |-- usage-guide.md               # Full CLI reference
|   |-- bun.md                        # Bun runtime standards
|   |-- elysia.md                     # Elysia framework patterns
|   |-- azure.md                      # Azure deployment standards
|   |-- template-authoring-guide.md   # How to create templates
|   |-- typebox-migration-2026-04-08.md   # TypeBox patterns reference
|   |-- comparison.md                 # Competitive analysis
|   |-- future-improvements.md        # Feature roadmap
|   |-- marketing-plan-2026-04-13.md  # Go-to-market plan
|   |-- knowledge-bases/              # 10 task-specific QA knowledge files
|   |-- qa.knowledge.md               # Global QA knowledge
|   |-- (various fix plans and changelogs)
|
|-- e2e/screenshots/                  # Flutter UI e2e test screenshots (22 PNGs)
|
|-- examples/
|   |-- bookmark-api-prd.md           # Example PRD (duplicate of sample-prds/)
|
|-- sample-prds/                      # Test input PRDs (5 files)
|   |-- todo-api.md                   # Simple
|   |-- bookmark-manager.md           # Medium
|   |-- beautician-scheduling.md      # Medium (multi-tenant)
|   |-- bjj-open-mat-finder.md        # Complex (geospatial)
|   |-- bjj-open-mat-flutter-app.md   # Complex (Flutter mobile)
|
|-- src/                              # PRODUCTION PIPELINE
|   |-- index.mts                     # Main entry point (CLI, config, DI, pipeline)
|   |-- agent-bridge.mts              # Programmatic entry point for other agents
|   |
|   |-- agents/                       # LLM-backed and utility agents
|   |   |-- base-agent.mts            # Abstract base with fallback chain
|   |   |-- codegen-agent.mts         # Code generation + sanitization
|   |   |-- documentation-agent.mts   # Hoppscotch collection generation
|   |   |-- eslint-agent.mts          # Programmatic ESLint (not LLM-backed)
|   |   |-- flutter-ui-agent.mts      # Flutter/Dart UI generation
|   |   |-- planning-agent.mts        # PRD -> task graph decomposition
|   |   |-- prd-expansion-agent.mts   # Short prompt -> full PRD
|   |   |-- qa-agent.mts              # Test execution (MongoDB, unit, integration)
|   |   |-- qa-knowledge.mts          # Persistent learning from test failures
|   |
|   |-- cli/                          # CLI argument parsing and wiring
|   |   |-- arg-parser.mts            # Original arg parser (agent-one)
|   |   |-- parse-args.mts            # Current flag parser
|   |   |-- prompt.mts                # Interactive PRD prompt
|   |   |-- run-orchestrator.mts      # CLI-to-engine bridge
|   |   |-- list-runs.mts             # --list-runs implementation
|   |   |-- show-status.mts           # --status implementation
|   |   |-- index.mts                 # Barrel
|   |
|   |-- config/                       # Configuration
|   |   |-- env.mts                   # Zod-validated env vars
|   |   |-- eslint.config.mts         # ESLint rules for generated code
|   |   |-- fallback-tiers.mts        # FallbackTier interface
|   |   |-- models.mts                # Model chains per provider and role
|   |
|   |-- container/
|   |   |-- di.mts                    # DI composition root
|   |
|   |-- core/                         # Core domain types (template engine)
|   |   |-- enums/                    # TEMPLATE_TYPE, ADDON_TYPE
|   |   |-- interfaces/               # IFeatureSpec, ITemplate, IReviewGate, etc.
|   |   |-- types/                    # GENERATION_STATUS
|   |
|   |-- generation/                   # Template-based generation engine
|   |   |-- engine.mts                # Orchestrates template rendering
|   |   |-- template-registry.mts     # Template type -> implementation mapping
|   |   |-- addon-discovery.mts       # Filesystem addon scanning
|   |   |-- template-contract-validator.mts
|   |
|   |-- git/
|   |   |-- git-ops.mts              # Git init and commit
|   |
|   |-- graph/                        # Task dependency DAG engine
|   |   |-- parallel-executor.mts     # Concurrent task execution
|   |   |-- get-ready-tasks.mts       # Dependency-aware task scheduling
|   |   |-- get-skipped-tasks.mts     # Mark blocked tasks
|   |   |-- validate-graph.mts        # DAG validation (missing deps, cycles)
|   |   |-- topological-sort.mts      # Linear ordering
|   |   |-- cycle-error.mts           # Typed cycle error
|   |   |-- visualize.mts             # Mermaid diagram generation
|   |   |-- task-graph.mts            # Barrel
|   |
|   |-- input/                        # Input parsing
|   |   |-- prd-parser.mts            # Markdown PRD -> IFeatureSpec[]
|   |   |-- prd-interviewer.mts       # Interactive PRD generation
|   |   |-- prompt-parser.mts         # Natural language -> IFeatureSpec[]
|   |
|   |-- interfaces/
|   |   |-- i-llm-factory.mts         # Provider-agnostic LLM factory
|   |
|   |-- io/                           # File I/O and reporting
|   |   |-- workspace.mts             # Workspace directory management
|   |   |-- activity-log.mts          # Per-task markdown activity log
|   |   |-- progress-reporter.mts     # Live progress.md file
|   |   |-- report-generator.mts      # Final run report
|   |   |-- read-code.mts             # Read file -> Result
|   |   |-- write-code.mts            # Write file -> Result
|   |   |-- read-json.mts             # Read JSON -> Result<T>
|   |   |-- write-json.mts            # Write JSON -> Result
|   |   |-- read-all-code-files.mts   # Recursive directory read
|   |   |-- file-protocol.mts         # Barrel
|   |
|   |-- llm/                          # LLM integration layer
|   |   |-- anthropic-factory.mts     # Anthropic ILlmFactory
|   |   |-- ollama-factory.mts        # Ollama ILlmFactory (local + cloud)
|   |   |-- openai-factory.mts        # OpenAI ILlmFactory
|   |   |-- stream-invoke.mts         # Streaming LLM calls + think-block stripping
|   |   |-- retry-with-backoff.mts    # Exponential backoff + jitter
|   |   |-- cost-tracker.mts          # Per-call dollar cost tracking
|   |   |-- token-tracker.mts         # Global token accumulation
|   |   |-- redact-secrets.mts        # API key redaction in logs
|   |   |-- thinking-spinner.mts      # Terminal spinner UX
|   |   |-- tracing.mts               # LangSmith trace config
|   |   |-- with-timeout.mts          # Promise timeout wrapper
|   |
|   |-- notifications/                # Pipeline event notifications
|   |   |-- notifier.mts              # Event dispatcher
|   |   |-- console-channel.mts       # Terminal notifications
|   |   |-- telegram-channel.mts      # Telegram bot notifications
|   |
|   |-- orchestrator/                 # Pipeline orchestration
|   |   |-- pipeline.mts              # Master orchestrator (11 phases)
|   |   |-- fix-loop.mts              # Core generate-lint-test-fix loop
|   |   |-- fallback-fix-loop.mts     # Multi-tier LLM escalation
|   |   |-- diagnostic-fix.mts        # Last-resort cross-model diagnosis
|   |   |-- scaffold-project.mts      # Generate project files
|   |   |-- generate-devcontainer.mts # VS Code DevContainer config
|   |   |-- validate-output.mts       # End-to-end output validation
|   |
|   |-- output/                       # Output writing
|   |   |-- file-writer.mts
|   |   |-- console-reporter.mts
|   |
|   |-- planning/                     # Generation planning (template engine)
|   |   |-- feature-extractor.mts
|   |   |-- dependency-resolver.mts
|   |   |-- generation-planner.mts
|   |
|   |-- prompts/                      # LLM prompt system
|   |   |-- codegen-system-prompt.mts # Loads codegen system prompt
|   |   |-- codegen.mts               # Barrel
|   |   |-- create-codegen-user-prompt.mts  # Dynamic codegen prompts
|   |   |-- create-fix-prompt.mts     # Error fix prompts
|   |   |-- documentation.mts         # Documentation prompts
|   |   |-- flutter-ui-system-prompt.mts    # Flutter system prompt
|   |   |-- flutter-ui-user-prompt.mts      # Flutter user prompts
|   |   |-- planning.mts              # Planning prompts
|   |   |-- prd-expansion.mts         # PRD expansion prompts
|   |   |-- qa-integration.mts        # Integration test prompts
|   |   |-- qa.mts                    # Unit test prompts
|   |   |-- md/                       # Raw markdown prompt files
|   |       |-- codegen-system.md     # 466-line codegen persona
|   |       |-- planning-system.md    # Task decomposition rules
|   |       |-- prd-expansion-system.md   # PRD generation rules
|   |       |-- qa-system.md          # Unit test generation rules
|   |       |-- qa-integration-system.md  # Integration test rules
|   |       |-- documentation-system.md   # Documentation rules
|   |       |-- codegen-tests/        # Task-type test templates for codegen
|   |       |-- qa-tests/             # Task-type test templates for QA
|   |
|   |-- state/                        # Persistent state management
|   |   |-- features-store.mts        # Feature generation tracking
|   |   |-- prd-store.mts             # PRD persistence
|   |   |-- session-store.mts         # Session handoff generation
|   |
|   |-- trace/                        # Observability
|   |   |-- trace-logger.mts          # Step recording
|   |   |-- session-summary.mts       # Summary aggregation
|   |   |-- trace-writer-fs.mts       # Filesystem trace writer
|   |   |-- trace-writer-mongo.mts    # MongoDB trace writer
|   |
|   |-- types/                        # Shared type definitions
|   |   |-- task.mts                  # Task, TaskGraph, TaskState
|   |   |-- pipeline.mts             # PipelineConfig, PipelineResult
|   |   |-- result.mts               # Result<T, E> discriminated union
|   |   |-- agent-context.mts        # AgentContext
|   |   |-- llm-errors.mts           # LLM error classification
|   |   |-- ok.mts / err.mts         # Result constructors
|   |
|   |-- validators/                   # Pre-QA code validators
|   |   |-- import-validator.mts      # Import path resolution
|   |   |-- extract-exports.mts       # Named export extraction
|   |
|   |-- verification/                 # Verification gates
|       |-- eslint-gate.mts
|       |-- test-gate.mts
|       |-- smoke-gate.mts
|       |-- playwright-gate.mts
|       |-- pipeline.mts             # Gate orchestrator
|
|-- src-langgraph/                    # EXPERIMENTAL LANGGRAPH PIPELINE
|   |-- index.mts                     # CLI entry point
|   |-- serve-ui.mts                  # Dashboard server (port 3333)
|   |-- config/                       # Env + model config
|   |-- graph/                        # LangGraph state machines
|   |   |-- state.mts                 # PipelineState annotation
|   |   |-- build-pipeline-graph.mts  # Top-level graph
|   |   |-- build-task-graph.mts      # Per-task fix-loop graph
|   |   |-- visualize.mts            # Mermaid output
|   |-- graphs/                       # LangGraph CLI/Studio definitions
|   |   |-- pipeline.ts
|   |   |-- task-loop.ts
|   |-- llm/                          # Ollama integration
|   |-- nodes/                        # Graph step implementations
|   |   |-- plan-node.mts
|   |   |-- codegen-node.mts
|   |   |-- eslint-node.mts
|   |   |-- qa-node.mts
|   |   |-- collect-code-node.mts
|   |   |-- docs-node.mts
|   |   |-- save-result-node.mts
|   |-- orchestrator/
|   |   |-- run-pipeline.mts          # 3-phase orchestration
|   |-- types/                        # Shared types
|
|-- templates/                        # CODE GENERATION TEMPLATES
|   |-- base/                         # 19 CRUD templates (.tmpl.mts)
|   |   |-- container, docker-compose, env-config, eslint-config
|   |   |-- gitignore, health-router, interface, logger
|   |   |-- package-json, repository, router, schema
|   |   |-- server, service, swagger-detail, test
|   |   |-- trace-plugin, tsconfig, version-router
|   |-- addons/                       # 6 addon templates
|       |-- aws-cdk/
|       |-- azure-terraform/
|       |-- external-api-client/
|       |-- queue-consumer/
|       |-- teams-notification/
|       |-- timer-job/
|
|-- tests/                            # TEST SUITE (42 files)
|   |-- cli/                          # CLI tests (5)
|   |-- core/                         # Core type tests (3)
|   |-- generation/                   # Generation engine tests (6)
|   |-- git/                          # Git operations tests (1)
|   |-- input/                        # Input parsing tests (3)
|   |-- output/                       # Output writing tests (1)
|   |-- planning/                     # Planning tests (3)
|   |-- state/                        # State management tests (3)
|   |-- templates/                    # Template rendering tests (6)
|   |-- trace/                        # Tracing tests (3)
|   |-- verification/                 # Gate tests (5)
|   |-- addons/                       # Addon template tests (6)
|   |-- activity-log.test.mts
|   |-- parse-test-file.test.mts
|
|-- (root files)
    |-- package.json, tsconfig.json, bun.lock
    |-- .gitignore, .gitkeep
    |-- README.md, CONTRIBUTING.md, SECURITY.md
    |-- langgraph.json
    |-- run.sh, run.cmd, run-bg.sh, run-bg.cmd
    |-- run-diagrams.sh, run-diagrams.cmd
    |-- sample-prd.md, davis.prd.md
    |-- bjj-open-mat-prd.md, beautician-scheduling-prd.md
    |-- dashboard-screenshot.png
```
