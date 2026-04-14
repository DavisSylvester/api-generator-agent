# Future Improvements

Prioritized roadmap of features beyond the P0/P1 work already implemented. Items are grouped by priority tier and ordered by impact within each tier.

## P2 — Competitive Parity

These features close gaps with mature agents like Aider, SWE-agent, OpenHands, and Cline. Each one has a clear leader to reference for implementation patterns.

### Docker Image for Zero-Install Distribution

**Reference:** OpenHands publishes to `ghcr.io` with BuildKit caching.

Publish a Docker image so users can run the agent without installing Bun or any local dependencies. The image should include Bun, the agent source, and Docker-in-Docker support for MongoDB test containers.

```bash
docker run --rm -v $(pwd):/work ghcr.io/your-org/api-generator-agent /work/my-prd.md
```

**Implementation notes:**
- Multi-stage Dockerfile: builder (install deps) -> runner (copy node_modules + src)
- Mount the working directory for PRD input and workspace output
- Docker-in-Docker or sibling container pattern for MongoDB test containers
- Publish on GitHub release via CI workflow

---

### Layered Configuration System (YAML)

**Reference:** Aider supports `.aider.conf.yml` at project root, home directory, and CWD with CLI flag overrides.

Replace env-var-only configuration with a layered system:

```
CLI flags  >  .api-gen-agent.yml (project)  >  ~/.api-gen-agent/config.yml (global)  >  .env  >  defaults
```

Add an `init` command that generates a starter config with comments:

```bash
api-generator-agent init
# Creates .api-gen-agent.yml with all options documented
```

**Sample config:**

```yaml
provider: openai
models:
  planning: gpt-5.4
  codegen: gpt-5.4
  documentation: gpt-5.4
  qa: gpt-5.4
pipeline:
  maxFixIterations: 5
  maxConcurrency: 4
  taskCostLimit: 3.00
  integrationPort: 4100
```

**Implementation notes:**
- Use `js-yaml` or `yaml` package to parse
- Load and merge configs in precedence order before passing to `loadEnv()`
- Every env var should have a YAML equivalent
- Validate merged config with the existing Zod schema

---

### Sandboxed Code Execution

**Reference:** OpenHands runs generated code in Docker containers. Bolt.new uses WebContainers (WASM sandbox).

Run generated code and tests inside a Docker container instead of directly on the host. This prevents generated code from accessing the host filesystem, network, or processes.

**Implementation notes:**
- Create a lightweight Docker image with Bun + MongoDB client
- Mount only the task's `code/` and `tests/` directories
- Run `bun test` inside the container
- Capture stdout/stderr and exit code
- Fall back to host execution if Docker is unavailable (with a warning)

---

### Checkpoint and Rollback System

**Reference:** Cline lets users diff against any previous checkpoint and roll back to it.

Each iteration already saves code snapshots in `iterations/{n}/code/`. Add a CLI command to restore a specific iteration:

```bash
api-generator-agent restore <run-id> <task-id> <iteration>
```

**Implementation notes:**
- Copy files from `iterations/{n}/code/` back to `tasks/{task-id}/code/`
- Show a diff before restoring
- Support `--list` to show available checkpoints with pass/fail status

---

### OpenTelemetry Tracing Export

**Reference:** OpenHands has full OTEL instrumentation with spans for `agent.step`, `tool.execute`, and `llm.completion`. Supports Laminar, Honeycomb, Jaeger, Datadog, and any OTLP backend.

Add optional OTEL export alongside existing LangSmith support. This lets users send traces to their existing observability platform.

**Implementation notes:**
- Add `@opentelemetry/api` and `@opentelemetry/sdk-trace-node`
- Create spans for: pipeline phases, task execution, LLM calls, test runs
- Enable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var
- When not set, tracing is a no-op (zero overhead)
- Attach cost and token metadata to LLM spans

---

### `.agentignore` File

**Reference:** Aider supports `.aiderignore` to exclude files from context.

When gathering dependency code for a task, respect an `.agentignore` file at the project root. This prevents the agent from reading large generated files, vendored code, or sensitive files.

```gitignore
# .agentignore
node_modules/
.workspace/
*.min.js
vendor/
```

**Implementation notes:**
- Use the `ignore` npm package (already an indirect dependency via eslint)
- Load `.agentignore` once at pipeline start
- Filter file lists through the ignore matcher before passing to agents

---

### Built-in Update Checker

**Reference:** Aider checks for new versions on startup with `--check-update` (on by default, `--no-check-update` to disable).

On startup, check npm registry for the latest published version. If newer than the running version, print a one-line notice.

```
[info] Update available: 0.1.0 -> 0.2.0  (run: bun update -g api-generator-agent)
```

**Implementation notes:**
- Fetch `https://registry.npmjs.org/api-generator-agent/latest` with a 2-second timeout
- Compare against `version` from package.json
- Cache the check result for 24 hours in `~/.api-gen-agent/last-update-check`
- Skip when `--no-check-update` flag is passed or `NO_UPDATE_CHECK=1` is set

---

### CHANGELOG.md with Auto-Generation

**Reference:** Aider maintains a changelog across 93+ releases. SWE-agent uses conventional commits for auto-generation.

Maintain a `CHANGELOG.md` and auto-generate it from conventional commits on release.

**Implementation notes:**
- Add `conventional-changelog-cli` as a dev dependency
- Add a `release` script: `bunx conventional-changelog -p angular -i CHANGELOG.md -s`
- Run as part of the GitHub Actions release workflow
- Tag releases with semver: `git tag v0.2.0`

---

### Permission Gates Before File Writes

**Reference:** Cline requires human approval for every file write, terminal command, and browser action.

Add an optional `--confirm` flag that prompts the user before writing generated code to the workspace. Useful when users want to review the plan and first iteration before committing to a full run.

**Implementation notes:**
- In `--confirm` mode, pause after planning and display the task graph
- Pause again after first code generation to show a file list
- Use `readline` or Bun's stdin for yes/no prompts
- Default off (non-interactive pipeline mode is the primary use case)

---

## P3 — Differentiation

These features would make the agent stand out from competitors but require significant effort. Implement after P2 is complete and the agent has real user adoption.

### Interactive REPL Mode

**Reference:** Aider has a full REPL with tab completion, vim bindings, multi-line input, and `/commands`.

Add an interactive mode where users can iteratively refine the PRD, re-run specific tasks, inspect generated code, and modify configuration without restarting.

```bash
api-generator-agent --interactive
> load beautician-scheduling-prd.md
> plan
> run setup-foundation
> show endpoint-auth
> fix endpoint-auth "auth middleware should use .as('plugin')"
> run-all
```

**Implementation notes:**
- Use `readline` or `@anthropic-ai/sdk` for line editing
- Maintain pipeline state across commands
- Support `/plan`, `/run <task>`, `/show <task>`, `/fix <task> <hint>`, `/status`, `/cost`
- This is a large feature — consider it a standalone milestone

---

### Browser Live Preview

**Reference:** Bolt.new runs code in WebContainers with live hot-reload preview.

After assembly, automatically start the generated API and open a browser with a Swagger/Hoppscotch-like UI showing all endpoints.

**Implementation notes:**
- Start the assembled Elysia app on a random port
- Generate a minimal HTML page with endpoint list and request forms
- Open with `Bun.spawn(["open", url])` or platform equivalent
- Kill the server on Ctrl+C

---

### VS Code Extension

**Reference:** Cline integrates deeply into VS Code with diff views, permission prompts, terminal streaming, and checkpoint timelines.

Wrap the CLI in a VS Code extension that shows:
- Task graph visualization in a panel
- Real-time log streaming
- Per-task code diffs
- One-click re-run of failed tasks

**Implementation notes:**
- Use the VS Code Extension API with a WebView panel
- Communicate with the CLI process via JSON-RPC or stdout parsing
- This is a major project — consider as a v2.0 feature

---

### Voice Input

**Reference:** Aider supports voice input for PRD dictation and commands.

Allow users to dictate PRDs or commands via microphone using Whisper or a similar STT model.

**Implementation notes:**
- Use OpenAI Whisper API or a local Whisper model
- Pipe transcribed text to the existing PRD input path
- Gated behind `--voice` flag

---

### Multi-Framework Support

Currently the agent only generates Elysia/Bun APIs. Add support for generating APIs in other frameworks:

- **Express/Node** — the most common target for hiring/teams
- **Fastify/Node** — for performance-focused teams
- **Hono/Bun** — Elysia alternative gaining traction

**Implementation notes:**
- Add a `--framework` flag and `FRAMEWORK` env var
- Per-framework prompt templates in `src/prompts/frameworks/`
- Per-framework test harness in the QA agent
- Setup-foundation task generates framework-specific scaffold

---

### Benchmark Harness

**Reference:** GPT Engineer and SWE-agent ship `bench` binaries for evaluating agent quality against standard datasets.

Build a benchmark suite that measures:
- Pass rate across a set of PRDs (todo, bookmarks, scheduling, etc.)
- Iterations to pass
- Cost per PRD
- Regression detection across agent versions

```bash
api-generator-agent bench --suite standard --provider openai
```

**Implementation notes:**
- `examples/` directory already has PRDs to use as benchmarks
- Record results to `benchmarks/{date}/{provider}.json`
- Compare against previous runs to detect regressions
- Run in CI on release branches

---

### Telegram Remote Stop Command

**Reference:** CI/CD bots that accept `/cancel` commands via chat.

Allow users to stop a running pipeline by sending `stop` to the Telegram bot. Currently, the `stop` command only works in a foreground terminal (stdin). Background runs launched via `run-bg.sh` or on a remote server have no way to be stopped short of `kill <PID>`.

**Implementation notes:**
- Add a polling loop that checks for incoming Telegram messages via `getUpdates` (long-polling) or a webhook
- Filter messages from the configured `TELEGRAM_CHAT_ID` only
- If message text is `stop` or `/stop`, call `AbortController.abort()` on the running pipeline
- Send a confirmation message back: "Pipeline stopping — current tasks will finish, no new tasks will start"
- The existing `AbortSignal` plumbing in `parallel-executor.mts` already handles graceful shutdown
- Polling interval: 5 seconds (same as status update cadence)
- Must work regardless of launch mode (foreground, background, Docker, remote)
- Security: only accept stop commands from the configured chat ID, ignore all others

---

## Priority Summary

| Tier | Items | Theme |
|---|---|---|
| **P2** | Docker image, YAML config, sandbox, checkpoints, OTEL, .agentignore, update checker, changelog, permission gates, Telegram remote stop | Catch up with mature agents |
| **P3** | Interactive REPL, browser preview, VS Code extension, voice input, multi-framework, benchmark harness | Stand-alone differentiators |

## Implementation Order (Recommended)

Within P2, tackle in this order based on user impact vs effort:

1. **YAML config + `init` command** — most requested by users setting up projects
2. **Docker image** — unlocks CI/CD use cases and zero-install trial
3. **`.agentignore`** — quick win, prevents context bloat
4. **Update checker** — small effort, improves upgrade adoption
5. **CHANGELOG.md** — pairs with the release workflow
6. **Checkpoint/rollback** — leverages existing iteration snapshots
7. **Sandboxed execution** — requires Docker-in-Docker, more complex
8. **Permission gates** — useful but non-default, lower priority
9. **OTEL export** — valuable for enterprise users, LangSmith covers most cases today
