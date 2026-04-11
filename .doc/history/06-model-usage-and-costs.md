# Model Usage, Performance, and Costs

## Models Used

| Model | Provider | Role | Context Window | Speed |
|-------|----------|------|---------------|-------|
| qwen3.5:27b | Ollama (local) | Planning, QA | 8K | ~50s per plan |
| qwen3-coder-next | Ollama (cloud) | Primary codegen | 8K | 10-90s per call |
| glm-5.1:cloud | Ollama (cloud) | Tier 2 fallback (Run 15 only) | 8K | 30-120s per call |
| gpt-5.4 | OpenAI | Tier 2 fallback (Run 16+) | 128K | 20-40s per call |
| claude-sonnet-4-6 | Anthropic | Tier 3 fallback | 200K | 15-30s per call |

---

## Per-Run Statistics

### Run 13 (First MongoDB run)
| Metric | Value |
|--------|-------|
| Duration | 58 min |
| Result | 5/12 passed |
| LLM calls | 47 |
| Total prompt chars sent | 705,804 (~176K tokens) |
| qwen3-coder-next | 83 success, 3 fail |
| Fallback escalations | 0 (not yet implemented) |
| Codegen failures | 2 timeout crashes, 1 "no code blocks" |

### Run 14 (Knowledge bases + timeout fix)
| Metric | Value |
|--------|-------|
| Duration | 156 min |
| Result | 6/12 passed |
| LLM calls | 93 |
| Total prompt chars sent | 1,153,770 (~288K tokens) |
| qwen3-coder-next | 145 success, 2 fail |
| Fallback escalations | 0 (not yet implemented) |
| Codegen failures | 2 "no code blocks" (prose output) |

### Run 15 (Fallback system v1 — glm + Sonnet)
| Metric | Value |
|--------|-------|
| Duration | 238 min |
| Result | 10/12 passed |
| LLM calls | 141 |
| Total prompt chars sent | 2,823,947 (~706K tokens) |
| qwen3-coder-next | 208 success, 5 fail |
| glm-5.1:cloud (Tier 2) | 48 success, 0 fail |
| claude-sonnet-4-6 (Tier 3) | 0 success (wrong model ID: 404) |
| Fallback escalations | 3 to Tier 2, 3 to Tier 3 |
| Tasks saved by fallback | 0 (Sonnet model ID was wrong) |

### Run 16 (GPT-5.4 replaces glm)
| Metric | Value |
|--------|-------|
| Duration | 210 min |
| Result | 8/12 passed |
| LLM calls | 233 |
| Total prompt chars sent | 3,526,004 (~881K tokens) |
| qwen3-coder-next | 319 success, 3 fail |
| gpt-5.4 (Tier 2) | 68 success, 0 fail |
| claude-sonnet-4-6 (Tier 3) | 64 success, 0 fail |
| Fallback escalations | 5 to Tier 2, 4 to Tier 3 |
| Tasks saved by GPT-5.4 | 1 (endpoint-users, iter 4) |
| Tasks saved by Sonnet | 0 |

### Run 17 (Perfect run)
| Metric | Value |
|--------|-------|
| Duration | 56 min |
| Result | 13/13 passed |
| LLM calls | 74 |
| Total prompt chars sent | 1,288,961 (~322K tokens) |
| qwen3-coder-next | 137 success, 1 fail |
| gpt-5.4 (Tier 2) | 2 success, 0 fail |
| claude-sonnet-4-6 (Tier 3) | 0 calls needed |
| Fallback escalations | 2 to Tier 2, 0 to Tier 3 |
| Tasks saved by GPT-5.4 | 2 (service-auth iter 1, endpoint-todos) |

---

## Aggregate Totals (Runs 13-17)

| Metric | Total |
|--------|-------|
| Pipeline runs | 5 |
| Total duration | ~718 min (~12 hours) |
| Total LLM calls | 588 |
| Total prompt chars sent | 9,498,486 (~2.37M tokens) |
| Total prompt tokens (est.) | ~2,374,000 |
| Total completion tokens (est.) | ~4,000,000 (longer outputs than inputs) |

### By Model

| Model | Successful Calls | Failed Calls | Success Rate |
|-------|-----------------|-------------|-------------|
| qwen3.5:27b (planning) | 5 | 0 | 100% |
| qwen3-coder-next | 892 | 14 | 98.5% |
| glm-5.1:cloud | 48 | 0 | 100% |
| gpt-5.4 | 70 | 0 | 100% |
| claude-sonnet-4-6 | 64 | 1 (wrong ID) | 98.5% |

### By Failure Type

| Failure Type | Count | Models Affected |
|-------------|-------|-----------------|
| No code blocks (prose output) | 8 | qwen3-coder-next |
| Timeout / connection abort | 3 | qwen3-coder-next |
| Wrong model ID (404) | 1 | claude-sonnet-4-6 |
| Test failures (QA loop) | ~500 iterations | All models |

---

## Model Comparison: Who Solved What

### Tasks that qwen3-coder-next could NOT solve (across all runs)

| Task | Runs Failed | Who Solved It | Iters Needed |
|------|-------------|--------------|-------------|
| service-auth | Runs 14, 16, 17 (20 iters each) | **GPT-5.4** | 1 iteration |
| endpoint-users | Run 16 (15 iters) | **GPT-5.4** | 4 iterations |
| endpoint-todos | Run 17 (20 iters) | **GPT-5.4/Sonnet fallback** | via escalation |

### GPT-5.4 strengths
- Solves auth-related tasks that qwen struggles with (JWT, password hashing, Bun.password API)
- Produces cleaner code on first try — fewer iteration loops
- 100% success rate when called (70 calls, 0 failures)

### qwen3-coder-next strengths
- Fast and free (Ollama cloud)
- Good at models, repositories, basic services
- 98.5% call success rate
- Handles most tasks without needing fallback

---

## Cost Estimates

### Ollama Cloud (qwen3-coder-next, glm-5.1:cloud)
- **Cost:** Free (Ollama cloud API with API key)
- **Total calls:** ~940
- **Estimated tokens:** ~5M input + output

### OpenAI (GPT-5.4)
- **Total calls:** 70
- **Estimated input tokens:** ~300K
- **Estimated output tokens:** ~500K
- **Estimated cost:** ~$4-8 (based on GPT-5.4 pricing)

### Anthropic (Claude Sonnet 4.6)
- **Total calls:** 64
- **Estimated input tokens:** ~250K
- **Estimated output tokens:** ~400K
- **Estimated cost:** ~$3-6 (based on Sonnet pricing)

### Total estimated API cost: ~$7-14 across all runs

---

## Time Analysis

### Where time was spent (Run 17 — perfect run, 56 min)

| Phase | Time | % |
|-------|------|---|
| Planning | ~1 min | 2% |
| First-try passes (8 tasks) | ~10 min | 18% |
| Fix iterations (qwen) | ~25 min | 45% |
| Fallback (GPT-5.4) | ~5 min | 9% |
| ESLint passes | ~10 min | 18% |
| QA/test execution | ~5 min | 9% |

### Iteration time per model (average)

| Model | Avg iteration time | Range |
|-------|-------------------|-------|
| qwen3-coder-next | ~45s | 10-180s |
| gpt-5.4 | ~30s | 15-60s |
| claude-sonnet-4-6 | ~25s | 10-45s |
| ESLint (per file) | ~8s | 3-15s |
| bun test (per run) | ~2s | 0.3-6s |

---

## Token Usage for Agent Development (Claude Code sessions)

This agent was developed over multiple Claude Code sessions using Claude Opus 4.6. Estimated token usage for the development process itself:

| Activity | Est. Input Tokens | Est. Output Tokens |
|----------|------------------|-------------------|
| Initial architecture + pipeline design | ~200K | ~100K |
| Bug investigation + fixes (23 bugs) | ~500K | ~300K |
| Architecture shift (MongoDB/resolve) | ~300K | ~200K |
| Fallback system design + implementation | ~400K | ~250K |
| Knowledge base creation | ~100K | ~80K |
| Run monitoring + status checks | ~600K | ~50K |
| Documentation | ~200K | ~150K |
| **Total development** | **~2.3M** | **~1.1M** |

### Combined totals

| Category | Input Tokens | Output Tokens | Total |
|----------|-------------|---------------|-------|
| Agent development (Claude Code) | ~2.3M | ~1.1M | ~3.4M |
| Pipeline execution (5 runs) | ~2.4M | ~4.0M | ~6.4M |
| **Grand total** | **~4.7M** | **~5.1M** | **~9.8M tokens** |
