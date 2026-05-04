# Discord Integration Plan

Live, step-level monitoring of api-generator-agent runs in Discord. One thread per run, one editable card per task, separate alert channel for hard failures. Supports both webhook and bot transports.

This is the canonical implementation plan — Phase 0 follows the order in §10.

---

## 1. Goals

- **Active monitoring** — every step (codegen, eslint, qa, iteration boundaries) reflected in Discord without rate-limiting the user out of the channel.
- **One card per task, live-edited** — single rich embed per task, mutated in place as the fix-loop progresses.
- **Thread per run** — each pipeline run posts to its own thread inside a configured channel.
- **Both transports** — webhook (zero hosting, requires forum channel for thread-per-run) and bot (any channel type, future bidirectional commands).
- **Failure isolation** — Discord errors never crash the pipeline. Discord is observability, not core path.

---

## 2. The forum-channel constraint (read this)

Discord webhooks **cannot create threads in regular text channels.** Two options:

- **Configure the target channel as a Discord forum channel** → webhook posts with `thread_name`, Discord auto-creates a forum post (a thread). Recommended default.
- **Use the bot transport** → can create threads in any channel type.

Plain text channel + webhook will lose thread-per-run grouping. The plan defaults to forum channel for the webhook path.

---

## 3. Architecture

### File layout

```
src/notifications/discord/
  interfaces/
    i-discord-transport.mts          # uniform contract: webhook + bot
    i-card-state.mts                 # per-task card state shape
    i-discord-config.mts             # validated env config
  discord-channel.mts                # implements NotificationChannel + ActivityLog observer
  webhook-transport.mts              # forum-channel webhook impl
  bot-transport.mts                  # discord.js (or REST + token)
  card-formatter.mts                 # builds embed from CardState
  card-state-store.mts               # in-memory + disk-persisted map
  edit-debouncer.mts                 # coalesces rapid edits per messageId
  alert-sender.mts                   # cross-channel @mention on hard failures
  schemas/                           # TypeBox schemas (see §6)
```

### Transport contract

```ts
interface IDiscordTransport {
  readonly kind: 'webhook' | 'bot';
  startThread(runId: string, summary: string): Promise<{ threadId: string }>;
  postCard(threadId: string, embed: DiscordEmbed): Promise<{ messageId: string }>;
  editCard(threadId: string, messageId: string, embed: DiscordEmbed): Promise<void>;
  postAlert(payload: AlertPayload): Promise<void>;   // separate channel + @mention
  postSummary(threadId: string, embed: DiscordEmbed): Promise<{ messageId: string }>;
  health(): Promise<boolean>;
}
```

`DiscordChannel` does not care which transport is plugged in. Selection is via `DISCORD_TRANSPORT=webhook|bot`.

---

## 4. ActivityLog hook (the only invasive change)

The `DiscordChannel` consumes step-level events from `src/io/activity-log.mts`. Today `ActivityLog` is write-only. Add an optional callback:

```ts
// src/io/activity-log.mts
constructor(path: string, onEvent?: (e: ActivityEventInput) => void | Promise<void>) { ... }

async event(input: ActivityEventInput): Promise<void> {
  // existing append-to-md logic
  await this.onEvent?.(input);   // NEW
}
```

Wired in `src/orchestrator/pipeline.mts:269`:

```ts
activityLogs.set(t.id, new ActivityLog(
  workspace.taskActivityPath(t.id),
  (e) => discordChannel.onActivityEvent(runId, t.id, e),
));
```

Everything else in the integration is **additive** — no other existing files change.

---

## 5. Card lifecycle

```
Pipeline starts
  └─ DiscordChannel.start(taskCount)
       └─ transport.startThread(runId, "Run abc-123 — N tasks") → threadId
       └─ post intro message: "Pipeline started — N tasks queued"

For each task in graph:
  └─ ActivityLog 'task-start'
       └─ formatter.buildInitial(task) → embed (yellow, "queued")
       └─ transport.postCard(threadId, embed) → messageId
       └─ store.set(taskId, {threadId, messageId, state})

Per step in fix-loop:
  └─ ActivityLog 'codegen-start' / 'codegen-end' / 'eslint-*' / 'qa-*'
       └─ store.update(taskId, patchFromEvent(e))
       └─ formatter.rebuild(state) → embed
       └─ debouncer.queueEdit(messageId, embed)
            └─ transport.editCard(threadId, messageId, embed)

Iteration end / task end:
  └─ if pass:  state.status = 'pass';  embed color → green
  └─ if fail:  state.status = 'fail';  embed color → red
               if 'HARD FAILURE': also alert-sender.postAlert(...)
       └─ final edit (no further updates after this)

Pipeline complete:
  └─ DiscordChannel.stop()
       └─ transport.postSummary(threadId, runSummaryEmbed)
            (counts, total duration, total cost, link to report.md)
```

---

## 6. Card embed schema (TypeBox)

Per the CLAUDE.md TypeBox rule, all new schemas use `t` from TypeBox / `Static` to derive types.

### CardState

```ts
import { Type, Static } from '@sinclair/typebox';

export const CardStateSchema = Type.Object({
  runId: Type.String(),
  taskId: Type.String(),
  taskName: Type.String(),
  taskType: Type.Union([
    Type.Literal('setup'),
    Type.Literal('model'),
    Type.Literal('endpoint'),
    Type.Literal('middleware'),
    Type.Literal('service'),
    Type.Literal('repository'),
  ]),
  status: Type.Union([
    Type.Literal('queued'),
    Type.Literal('codegen'),
    Type.Literal('eslint'),
    Type.Literal('qa'),
    Type.Literal('pass'),
    Type.Literal('fail'),
    Type.Literal('hard-fail'),
  ]),
  iterations: Type.Number(),
  currentIteration: Type.Number(),
  steps: Type.Array(Type.Object({
    name: Type.String(),
    durationMs: Type.Optional(Type.Number()),
    ok: Type.Optional(Type.Boolean()),
    detail: Type.Optional(Type.String()),
  })),
  model: Type.Optional(Type.String()),
  inputTokens: Type.Number({ default: 0 }),
  outputTokens: Type.Number({ default: 0 }),
  taskCostUsd: Type.Number({ default: 0 }),
  startedAt: Type.Number(),
  finishedAt: Type.Optional(Type.Number()),
  lastError: Type.Optional(Type.String()),
  threadId: Type.String(),
  messageId: Type.String(),
});

export type CardState = Static<typeof CardStateSchema>;
```

### Single-card embed layout

Discord limits: 6000 chars total, 25 fields, 1024 per field value.

| Section | Content |
|---|---|
| Title | `Task: <name>` |
| Color | `0xFFAA00` (running), `0x2ECC71` (pass), `0xE74C3C` (fail) |
| Description | `🟡 codegen → ✓ eslint → qa running... iter 2/5` |
| Field: Status | `running` / `passed` / `failed` / `hard-failure` |
| Field: Type | `setup` / `endpoint` / etc. |
| Field: Iteration | `2 / 5` |
| Field: Model | e.g. `claude-opus-4-7` |
| Field: Codegen | `1.4s · 5 files · 12k chars` |
| Field: ESLint | `0.3s · ✓` |
| Field: QA | `8.2s · unit ✓ · 0 errors` |
| Field: Tokens | `12,450 in / 8,300 out` |
| Field: Cost | `$0.18 task / $0.94 run` |
| Field: Started | `<t:UNIX:T>` (Discord renders local time) |
| Field: Duration | `12s` |
| Field: Run ID | first 8 chars + tooltip on full |
| Field: Workspace | `.workspace/<runId>/` |
| Field: Last Error | (failure only) — first 1000 chars |
| Footer | `iter <n> · <model> · run <runId>` |

---

## 7. Configuration (env)

Added to `src/config/env.mts` and `.env.example`. Validated with TypeBox + `Value.Parse()`.

```env
# ── Discord ───────────────────────────────────────────────────────
DISCORD_ENABLED=true
DISCORD_TRANSPORT=webhook              # webhook | bot

# Webhook mode (forum channels required for thread-per-run)
DISCORD_PIPELINE_WEBHOOK_URL=
DISCORD_QA_TOOLS_WEBHOOK_URL=
DISCORD_ALERT_WEBHOOK_URL=

# Bot mode (mutually exclusive with webhook URLs)
DISCORD_BOT_TOKEN=
DISCORD_PIPELINE_CHANNEL_ID=
DISCORD_QA_TOOLS_CHANNEL_ID=
DISCORD_ALERT_CHANNEL_ID=

# Common
DISCORD_ALERT_MENTION=                 # <@&role-id> or <@user-id> or @here
```

Validation rules (enforced at startup, fail-fast):

- If `DISCORD_ENABLED=true` and `DISCORD_TRANSPORT=webhook` → `DISCORD_PIPELINE_WEBHOOK_URL` required.
- If `DISCORD_TRANSPORT=bot` → `DISCORD_BOT_TOKEN` and `DISCORD_PIPELINE_CHANNEL_ID` required.
- Cannot set both webhook URLs and bot token (clear error).
- `DISCORD_ALERT_WEBHOOK_URL` (or alert channel) is required for hard-failure routing.
- `DISCORD_ALERT_MENTION` is required when alert routing is configured (otherwise the alert posts but doesn't ping anyone).

---

## 8. Hard-failure alert routing

When a task hits HARD FAILURE (`state.lastError?.includes('HARD FAILURE')`):

1. **Card edits in place** — flips to red final state in the run thread.
2. **Separate alert message** posts to `DISCORD_ALERT_WEBHOOK_URL` (or alert channel) with:
   - `@mention` from `DISCORD_ALERT_MENTION`
   - Title: `🚨 HARD FAILURE — Task <id>`
   - Run ID, task ID
   - Error excerpt (first ~1000 chars)
   - Deep link to the thread: `https://discord.com/channels/{guildId}/{threadId}`
   - Workspace path

Both transports support deep links. The bot needs to know the guild ID; the webhook payload already carries it implicitly.

---

## 9. Persistence + resume

`CardStateStore` writes to `<run>/discord-cards.json` after every state mutation (atomic write via temp + rename).

```json
{
  "runId": "...",
  "threadId": "...",
  "transport": "webhook",
  "tasks": {
    "setup-foundation": { ...CardState },
    "user-endpoint":    { ...CardState }
  }
}
```

On `--resume <runId>`, the discord channel:

1. Reads `discord-cards.json`.
2. Re-uses the same `threadId` and per-task `messageId`s.
3. Continues editing the existing cards instead of posting new ones.

If the file is missing (run pre-dates Discord integration), discord channel logs a warning and starts a fresh thread.

---

## 10. Run-summary message

Posted at end of pipeline (in the same thread, as a final card):

| Field | Content |
|---|---|
| Title | `Run complete — abc-123` |
| Color | green if all passed, red if any hard failure, yellow otherwise |
| Description | `N/M tasks passed · Xs · $Y.YY` |
| Field: Tasks | `✅ X completed · ❌ Y failed · ⏭ Z skipped` |
| Field: Hard Failures | list of task IDs (if any) |
| Field: Tokens | cumulative in/out |
| Field: Cost | total |
| Field: Models Used | distinct models from `CostTracker.getSummary()` |
| Field: Report | `.workspace/<runId>/report.md` |
| Field: Workspace | `.workspace/<runId>/` |

---

## 11. Edit debouncing & rate-limit safety

Discord webhook posts are capped at 30/min. **Edits are not subject to that bucket** but have a softer per-channel limit (~5/sec).

- **Per-message debouncer**: 250ms window per `messageId`. Multiple `update(state)` calls within the window collapse to the latest.
- **Global token bucket**: 5 edits/sec across all messages, leaky.
- **429 handling**: exponential backoff (250ms → 1s → 4s → drop), continue with next event. Pipeline never blocks on Discord.

---

## 12. Failure isolation

Discord is observability, not core path. If the transport throws or returns non-2xx:

- Log via Winston (`logger.warn('[discord] ...')`).
- Mark transport `unhealthy = true`, skip all subsequent calls for the run.
- Optionally retry once after backoff for the next event.
- Pipeline continues unchanged.

Same pattern as the existing `TelegramChannel`.

---

## 13. Secret redaction

Webhook URLs and bot tokens are sensitive. Add explicit redact rules to `src/llm/redact-secrets.mts`:

- Pattern: `/discord\.com\/api\/webhooks\/\d+\/[\w-]+/g` → `https://discord.com/api/webhooks/[REDACTED]/[REDACTED]`
- Pattern for bot tokens: `/Bot\s+[A-Za-z0-9._-]+/g` → `Bot [REDACTED]`
- Generic env vars `DISCORD_*_TOKEN` and `DISCORD_*_WEBHOOK_URL` redacted from any logged config dump.

The redactor is a Winston format, so any URL or token that ends up in `logger.info(...)` gets sanitized before reaching transports.

---

## 14. Phased implementation

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| **0** | Add `onEvent?` to `ActivityLog` + wire from pipeline. No Discord code yet — just the seam, with a unit test that proves the callback fires. | ~30 LoC | Low |
| **1** | `IDiscordTransport` interface, `WebhookTransport` (forum channel), `CardFormatter`, minimal `DiscordChannel` posting at `NotificationChannel` task-level events only (no step-level edits yet). Verify thread creation + card posting end-to-end. | Medium | Low |
| **2** | Wire `ActivityLog.onEvent` → `DiscordChannel.onActivityEvent` → step-level live edits via `EditDebouncer`. | Medium | Medium (edit semantics + state machine) |
| **3** | Hard-failure alert path. Separate webhook/channel + `@mention`. Deep links into the run thread. | Small | Low |
| **4** | `CardStateStore` disk persistence + `--resume` reattachment. | Small | Low |
| **5** | Run-summary message at end of thread. | Small | Low |
| **6** | `BotTransport` (discord.js) for users who want regular text channels or future commands. Same `IDiscordTransport` contract. | Medium | Low |
| **7** | (Future) Bidirectional commands via bot — `/abort`, `/status`, `/skip <taskId>`. New surface; out of scope for v1. | Larger | New surface |

---

## 15. Test strategy

- `WebhookTransport` against a fake Discord HTTP server (`bun test` with a local listener) — covers thread create, post, edit, alert, 429 retry.
- `EditDebouncer` unit tests — coalescing, ordering, 429 backoff.
- `CardFormatter` snapshot tests — given a `CardState`, expected embed JSON.
- `DiscordChannel` integration test — feed a synthetic `ActivityLog` event stream, assert the right transport calls fire in the right order with the right payloads.
- `CardStateStore` roundtrip — write, kill process, read, verify resume continuity.

No live-Discord tests in CI. A manual smoke script (`bun run smoke:discord`) hits a real test webhook for human verification.

---

## 16. Out of scope (for v1)

- Bidirectional commands (Phase 7+).
- Inline artifact previews (Discord file uploads). Cards link to local paths instead.
- Multi-language localization of card text.
- Alternative transports (Slack, Teams) — same interface design supports them, but separate plan.

---

## 17. Open follow-ups (after v1 ships)

- Tune which step-level events live-edit vs which get coalesced (e.g., per-iteration codegen-start might be too noisy on long runs).
- Per-task thread instead of per-run (one-thread-per-task) if some users prefer drilldown over scrollback.
- Optional Grafana / OpenTelemetry export from the same `ActivityLog.onEvent` seam.
