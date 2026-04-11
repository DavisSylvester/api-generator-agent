# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers with a description of the vulnerability
3. Include steps to reproduce if possible
4. Allow reasonable time for a fix before public disclosure

## Security Model

### API Key Handling

- API keys are loaded from environment variables or `.env` files
- Keys are **never logged** — Winston uses a redaction format that strips known key patterns (`sk-*`, `sk-ant-*`, `key-*`) and known field names (`apiKey`, `OPENAI_API_KEY`, etc.)
- Keys are never written to workspace output files
- `.env` files are excluded from git via `.gitignore`

### Generated Code Execution

- The QA agent runs generated code and tests in a subprocess
- MongoDB test containers run on an isolated port (default: 27018)
- Generated code has access to the local filesystem within the workspace directory

### Dependencies

- Dependencies are pinned via `bun.lock`
- No post-install scripts execute arbitrary code (except `isolated-vm` from `@hoppscotch/cli`, which requires native compilation)

## Scope

This agent generates code that runs locally. It does not:
- Expose any network services beyond test servers on localhost
- Send generated code to external services (except LLM providers for generation)
- Store credentials in generated output
