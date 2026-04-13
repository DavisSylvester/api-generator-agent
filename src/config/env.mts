import { z } from 'zod';

export const LLM_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const envSchema = z.object({
  LLM_PROVIDER: z.enum(LLM_PROVIDERS).default('ollama'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().url().default(`http://localhost:11434`),
  OLLAMA_API_KEY: z.string().optional(),
  LANGSMITH_TRACING: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  LANGSMITH_ENDPOINT: z.string().url().default('https://api.smith.langchain.com'),
  LANGSMITH_API_KEY: z.string().default(``),
  LANGSMITH_PROJECT: z.string().default('api-generator-agent'),
  MAX_FIX_ITERATIONS: z.coerce.number().int().min(1).max(20).default(5),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
  WORKSPACE_DIR: z.string().default('.workspace'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(10000).max(3600000).default(1800000),
  INTEGRATION_PORT: z.coerce.number().int().min(1024).max(65535).default(4100),
  TASK_COST_LIMIT: z.coerce.number().min(0).default(3.00),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NOTIFICATION_INTERVAL_MS: z.coerce.number().int().min(60000).max(3600000).default(300000),
}).superRefine((data, ctx) => {
  if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'OPENAI_API_KEY is required when LLM_PROVIDER is "openai"',
    });
  }
  if (data.LLM_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ANTHROPIC_API_KEY'],
      message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER is "anthropic"',
    });
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(Bun.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

/**
 * Verify the selected LLM provider is actually reachable before starting the pipeline.
 * - ollama: ping the /api/version endpoint
 * - openai / anthropic: key presence is already enforced by the schema
 */
export async function preflightLlmCheck(env: EnvConfig): Promise<void> {
  if (env.LLM_PROVIDER === `ollama`) {
    const url = `${env.OLLAMA_HOST}/api/version`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const lines = [
        ``,
        `ERROR: Cannot reach Ollama at ${env.OLLAMA_HOST} (${msg})`,
        ``,
        `The pipeline requires a working LLM provider. Configure one of:`,
        ``,
        `  1. Local Ollama  — install from https://ollama.com, run "ollama serve",`,
        `                     then pull the required models:`,
        `                       ollama pull qwen3.5:27b`,
        `                       ollama pull qwen3-coder-next`,
        ``,
        `  2. OpenAI        — set in .env:`,
        `                       LLM_PROVIDER=openai`,
        `                       OPENAI_API_KEY=sk-...`,
        ``,
        `  3. Anthropic     — set in .env:`,
        `                       LLM_PROVIDER=anthropic`,
        `                       ANTHROPIC_API_KEY=sk-ant-...`,
        ``,
      ];
      throw new Error(lines.join(`\n`));
    }
  }
  // openai / anthropic key checks are handled by the Zod schema — if we get
  // here the key exists.  A bad key will surface on the first LLM call.
}
