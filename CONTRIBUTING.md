# Contributing

Thank you for your interest in contributing to API Generator Agent.

## Getting Started

```bash
git clone <repo-url>
cd api-generator-agent
bun install
```

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Docker](https://www.docker.com/) (for integration tests)
- An LLM provider (Ollama, OpenAI, or Anthropic)

### Type Checking

```bash
bunx tsc --noEmit
```

### Running

```bash
bun run src/index.mts sample-prd.md
```

## Code Standards

- **TypeScript strict mode** with no `any` types
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- **One interface per file** with `i-` prefix in `interfaces/` directories
- **Winston logger** for all output (no `console.log`)
- **Zod** for all external input validation
- **Result types** for error handling (`Result<T, E>`)
- Double quotes, trailing commas, arrow functions for callbacks

## Pull Request Process

1. Create a feature branch from `main`: `git checkout -b feat/your-feature`
2. Make your changes and ensure `bunx tsc --noEmit` passes
3. Write clear commit messages following conventional commits
4. Open a PR against `main` with a description of what changed and why
5. Ensure CI passes before requesting review

## Architecture

See the [README](README.md#project-structure) for a full project structure overview. Key patterns:

- **Agents** (`src/agents/`) extend `BaseAgent` and implement `execute()`
- **LLM factories** (`src/llm/`) implement `ILlmFactory` for provider abstraction
- **Orchestrator** (`src/orchestrator/`) runs the pipeline phases
- **DI container** (`src/container/di.mts`) wires everything together

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Your LLM provider and model
- Relevant log output (redact API keys)
