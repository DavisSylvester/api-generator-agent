# src/llm/ -- LLM Integration Layer

Handles all LLM provider communication, cost tracking, retry logic, and observability.

---

## anthropic-factory.mts

**Exports:** `AnthropicFactoryConfig`, `AnthropicFactory`

**What it does:** Implements `ILlmFactory` for Anthropic. Creates LangChain `ChatAnthropic` with API key, model, temperature, 8192-token max output.

**Why it exists:** Abstracts Anthropic-specific model creation behind `ILlmFactory`.

---

## ollama-factory.mts

**Exports:** `OllamaFactoryConfig`, `OllamaFactory`

**What it does:** Implements `ILlmFactory` for Ollama. Three factory methods:
- `create` -- standard chat model
- `createWithThinking` -- enables `think: true` for chain-of-thought
- `createWithJsonFormat` -- forces JSON output

Includes custom `createLongTimeoutFetch` with `AbortController` timeouts. Supports bearer token auth for Ollama cloud.

**Why it exists:** Ollama-specific complexity (custom fetch timeouts, thinking mode, JSON format, keep-alive, cloud auth) needs encapsulation.

---

## openai-factory.mts

**Exports:** `OpenAIFactoryConfig`, `OpenAIFactory`

**What it does:** Implements `ILlmFactory` for OpenAI. Creates LangChain `ChatOpenAI` with 16384-token max output.

---

## cost-tracker.mts

**Exports:** `LlmUsage`, `calculateCost()`, `CostTracker`, `CostSummary`

**What it does:** Tracks LLM API call costs. `MODEL_PRICING` contains per-1M-token pricing:
- OpenAI: gpt-5.4 ($2.50/$10.00)
- Anthropic: claude-sonnet-4-6 ($3/$15), claude-opus-4-6 ($15/$75)
- Ollama: free ($0/$0)

`CostTracker` records each call's model, tokens, cost, and task ID. Provides `getTaskCost`, `getTotalCost`, `getSummary`.

**Why it exists:** LLM calls have real costs. Enables live cost display, per-task cost limits, and post-run analysis.

---

## stream-invoke.mts

**Exports:** `StreamInvokeResult`, `StreamInvokeOptions`, `streamInvoke()`, `streamInvokeWithUsage()`

**What it does:** Primary LLM calling interface. Uses LangChain streaming API:
- Accumulates response chunks
- Extracts token usage from metadata
- Records via `tokenTracker`
- **Strips `<think>...</think>` blocks** from chain-of-thought models
- Wraps in `retryWithBackoff` if logger provided

**Why it exists:** Centralizes all LLM invocation: streaming, token tracking, think-block stripping, retry.

---

## retry-with-backoff.mts

**Exports:** `RetryConfig`, `retryWithBackoff()`

**What it does:** Generic retry with exponential backoff and jitter. Default: 5 retries, 2s base, 120s max.
- Classifies errors via `classifyLlmError` (non-retryable errors like auth failure -> throw immediately)
- Rate-limit errors use `retryAfterMs` if available
- Delay: `baseDelay * 2^attempt` + random jitter (0-50%)

**Why it exists:** LLM APIs are unreliable (rate limits, server errors, timeouts). Retry with backoff is the standard resilience pattern.

---

## redact-secrets.mts

**Exports:** `redactSecrets()`

**What it does:** Winston log format transformer. Two strategies:
- **Key-based:** Known secret keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) -> `[REDACTED]`
- **Pattern-based:** Regex matching `sk-ant-...`, `sk-...`, `key-...` (20+ chars) -> `[REDACTED]`

**Why it exists:** Prevents API keys from appearing in logs.

---

## thinking-spinner.mts

**Exports:** `ThinkingSpinner`

**What it does:** Terminal spinner with ASCII frames (`|`, `/`, `-`, `\`) rotating every 250ms. Shows randomly selected thinking phrases from a pool of 30, rotating every ~30 seconds. Displays elapsed time.

**Why it exists:** LLM calls take 30s to minutes. Visual feedback indicates the pipeline is working.

---

## token-tracker.mts

**Exports:** `TokenUsage`, `TokenSnapshot`, `tokenTracker` (global singleton)

**What it does:** Accumulates token usage across all LLM calls. Records exact counts or estimates (1 token ~ 4 chars). Provides cumulative stats, history, and summary.

**Why it exists:** Token tracking for context window monitoring, cost estimation, and debugging.

---

## tracing.mts

**Exports:** `TraceMetadata`, `createTraceConfig()`

**What it does:** Creates LangSmith-compatible trace config with tags (`role:X`, `model:X`, `run:X`, `task:X`, `iter:X`) and structured metadata.

**Why it exists:** LangSmith integration for detailed tracing of every LLM call.

---

## with-timeout.mts

**Exports:** `LlmTimeoutError`, `withTimeout()`

**What it does:** Promise timeout wrapper. Races promise against `setTimeout`. Throws `LlmTimeoutError` with model name and duration.

**Why it exists:** Prevents indefinite hangs from stuck LLM calls.
