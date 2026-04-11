# Upcoming Features — Implementation Plan

## 1. Resume from Previous Run (HIGH PRIORITY)
Skip tasks that already passed in a previous run. Read `{workspace}/tasks/{id}/status.json` — if status=completed and code exists in shared output, skip the task.

**Files:** `src/orchestrator/pipeline.mts`, `src/index.mts` (add `--resume <runId>` CLI arg)

## 2. Cost Estimator (MEDIUM)
Track real $ cost per model per call. Builds on token-tracker.

**Pricing:** qwen (free), GPT-5.4 (~$2/M input, $8/M output), Sonnet (~$3/M input, $15/M output)

**Files:** `src/llm/cost-tracker.mts`, update `token-tracker.mts`

## 3. Parallel Execution (MEDIUM)
Already have `maxConcurrency` in executeGraph. Verify independent tasks actually run in parallel.

**Files:** `src/graph/parallel-executor.mts` (verify), `src/config/env.mts` (MAX_CONCURRENCY)

## 4. Telegram Notifications (MEDIUM)
Send messages on: task pass, task fail, circuit break, hard failure, pipeline complete.

**Files:** `src/notifications/telegram.mts`, env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

## 5. Telegram Resume (COMPLEX)
Start a webhook server that listens for Telegram /resume commands. When hard failure occurs, send a message with inline keyboard buttons (retry, skip, abort). Wait for user response.

**Files:** `src/notifications/telegram-resume.mts`, needs polling or webhook server

## 6. Warm Cache for Sanitizer (LOW)
Cache common sanitizer fix patterns. If the same error+fix has been seen before, apply instantly.

**Files:** `src/agents/sanitizer-cache.mts`

## 7. Single-Task Rerun (covered by #1)
`--resume` with `--task <taskId>` flag to rerun just one task.
