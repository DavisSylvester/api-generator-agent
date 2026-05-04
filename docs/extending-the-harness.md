# Extending the Harness — Hooks & Plugin Surfaces

"Hooks" can mean two unrelated things in this repo. Pick the right one before you go looking for code.

---

## A. Claude Code hooks (settings.json)

These are commands the **Claude Code runtime** fires on its own events (tool use, stop, etc.). They are **not part of this app** — they live in the user's `~/.claude/settings.json` (global) or `<project>/.claude/settings.json` (project). The api-generator-agent pipeline never sees them and is never invoked by them.

If what you want is "fire X every time Claude Code does Y," use the `update-config` skill in your Claude Code session:

- "run prettier after every Edit"
- "show me a summary when Claude stops"
- "play a sound after a long task"

Don't try to wire those into `pipeline.mts`. The runtime owns that contract, not us.

---

## B. Pipeline extension points inside this app

The harness has no formal plugin API today. It has several existing extension surfaces, ordered from cheapest to most invasive.

### 1. Curated knowledge bases (no code change)

Drop a markdown file at `docs/knowledge-bases/<taskId>-knowledge.md`. The fix-loop seeds it as `qa-knowledge.md` for that task on every run (`src/orchestrator/fix-loop.mts:75-85`). The next codegen iteration sees the knowledge alongside QA failures.

Use this when you've debugged a failure mode by hand and want to bake the lesson into future runs without modifying code.

### 2. Notifier channels (the cleanest event hook)

`src/notifications/notifier.mts` defines:

```ts
interface NotificationChannel {
  notify(event: NotificationEvent): Promise<void>;
  start?(taskCount: number): void;
  stop?(): void;
}
```

Existing channels: `TelegramChannel`, `ConsoleChannel`. To add one:

1. Implement `NotificationChannel` somewhere under `src/notifications/`.
2. Register it in `src/container/di.mts` alongside the existing channels.

Events the pipeline emits (see `pipeline.mts`):

| Event | When |
|---|---|
| `task_started` | Before fix-loop runs for a task |
| `task_passed` | Task completed in the fix-loop |
| `task_failed` | Task ran out of iterations or QA could not be resolved |
| `hard_failure` | Task hit `HARD FAILURE` after fallback + diagnostic exhausted |
| `pipeline_complete` | Final summary (counts + duration) |

This is the right surface for "post to Slack on hard failure," "ping Discord when the run finishes," etc.

### 3. ActivityLog observers

`src/io/activity-log.mts:26` defines per-task event types: `task-start`, `iteration-start`, `codegen-start/end`, `eslint-start/end`, `qa-start/end`, `iteration-end`, `task-end`, `note`. Today every event is written to `<run>/.docs/tasks/<id>/activity.md` as a markdown row.

Currently a write-only sink. To turn it into a hook:

- Add an optional `onEvent?: (e: ActivityEvent) => void | Promise<void>` to the `ActivityLog` constructor and call it from `event()` after the markdown row is appended.
- Pass an observer in `pipeline.mts:269` where `new ActivityLog(...)` is constructed.

Use this when you want fine-grained per-step instrumentation — e.g., stream events to a dashboard, push to OpenTelemetry, or record per-iteration prompts to S3.

### 4. Phase-level before/after hooks (not yet built)

The pipeline today is a linear function. There is no `beforePhase` / `afterPhase` registry. If you want them, the change is small but invasive:

1. Add `hooks?: PipelineHooks` to `PipelineDeps` in `src/orchestrator/pipeline.mts:52`.
2. Add `hooks?: FixLoopHooks` to `FixLoopDeps` in `src/orchestrator/fix-loop.mts:33`.
3. Define hook signatures, e.g.:
   ```ts
   interface PipelineHooks {
     readonly beforePhase?: (name: string, ctx: PhaseContext) => Promise<void>;
     readonly afterPhase?: (name: string, ctx: PhaseContext, result: PhaseResult) => Promise<void>;
   }
   interface FixLoopHooks {
     readonly beforeCodegen?: (task: Task, iteration: number) => Promise<void>;
     readonly afterCodegen?: (task: Task, iteration: number, files: readonly CodeFile[]) => Promise<void>;
     readonly afterQa?: (task: Task, iteration: number, qa: QaResult) => Promise<void>;
   }
   ```
4. Call the hooks at the existing `logger.info('Phase X')` boundaries in `pipeline.mts` and at the codegen/eslint/qa boundaries in `fix-loop.mts`.
5. Wire through DI.

Reach for this only when the existing surfaces (notifier, activity log, knowledge bases) genuinely don't fit.

---

## Choosing a surface

| You want to… | Use |
|---|---|
| Make codegen smarter for a specific task you've debugged | Knowledge base file |
| React to high-level pipeline events (tasks, completion, hard failures) | Notifier channel |
| Instrument every codegen / lint / QA step | ActivityLog observer (small refactor) |
| Inject behavior at phase boundaries (e.g., before planning, after scaffold) | Phase hooks (not built yet — see §4) |
| Hook Claude Code's tool runtime itself | Claude Code `settings.json` (out of scope for this repo) |

If you're not sure which one fits, describe the event you want to react to and the action you want to take — the right surface is usually obvious from that pair.
