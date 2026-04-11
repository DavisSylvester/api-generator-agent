# Multi-Tier Model Fallback System

## Overview

When the primary codegen model (qwen3-coder-next) fails to produce working code within its iteration budget, the system escalates through increasingly capable (and expensive) models.

## Architecture

```
Task fails primary fix loop
  │
  ├─ Tier 1a: Retry same prompt with "MUST output code blocks" instruction
  │   └─ If codegen returned prose instead of code blocks
  │
  ├─ Tier 2: GPT-5.4 (OpenAI) — 16 fresh iterations
  │   └─ Fresh context, knowledge bases seeded, "MUST output code blocks"
  │
  └─ Tier 3: Claude Sonnet 4.6 (Anthropic) — 16 fresh iterations
      └─ Same setup as Tier 2
```

## Implementation

### Files

| File | Role |
|------|------|
| `src/config/fallback-tiers.mts` | `FallbackTier` interface |
| `src/orchestrator/fallback-fix-loop.mts` | `runFallbackFixLoop()`, `FixedModelCodegenAgent` subclass |
| `src/agents/base-agent.mts` | `runWithModel()` method for explicit model injection |
| `src/agents/codegen-agent.mts` | `systemPromptSuffix` field, `NO_CODE_BLOCKS_ERROR` constant |
| `src/container/di.mts` | Tier construction from env vars |
| `src/llm/openai-factory.mts` | OpenAI ChatGPT integration |
| `src/llm/anthropic-factory.mts` | Anthropic Claude integration |

### Configuration

Tiers activate based on environment variables:
- `OLLAMA_API_KEY` — enables primary model (qwen3-coder-next on Ollama cloud)
- `OPENAI_API_KEY` — enables Tier 2 (GPT-5.4)
- `ANTHROPIC_API_KEY` — enables Tier 3 (Claude Sonnet 4.6)

### Tier 1a: No Code Blocks Retry

If codegen returns "No code blocks found in codegen response", the same prompt is retried once with an appended system instruction:

```
You MUST output fenced code blocks. Do NOT write explanations or analysis without code.
Every response MUST contain at least one fenced code block with a file path.
```

This catches the common case where the LLM writes a paragraph of analysis instead of code.

### Tier 2/3: Fresh Fix Loop

The fallback tiers run a completely fresh fix loop with:
- A new `FixedModelCodegenAgent` that bypasses the model chain and uses the specific model directly
- Knowledge bases seeded from persistent files
- The "MUST output code blocks" instruction always active
- Independent iteration counter (16 iterations)

## Results

| Run | Task | Primary Result | Tier 2 (GPT-5.4) | Tier 3 (Sonnet) |
|-----|------|---------------|-------------------|-----------------|
| 15 | endpoint-users | FAIL (15 iters) | Not yet available | N/A |
| 16 | service-auth | FAIL (15 iters) | FAIL (16 iters) | FAIL (16 iters) |
| 16 | endpoint-users | FAIL (15 iters) | **PASS (iter 4!)** | N/A |
| 17 | service-auth | FAIL (20 iters) | **PASS (iter 1!)** | N/A |
| 17 | endpoint-todos | FAIL (20 iters) | **PASS (via fallback)** | N/A |

GPT-5.4 proved especially effective — it solved service-auth in 1 iteration after qwen failed 20, and saved endpoint-users/todos on multiple runs.
