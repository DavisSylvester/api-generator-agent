import { z } from 'zod';

const envSchema = z.object({
  OLLAMA_HOST: z.string().url().default('http://192.168.128.230:11434'),
  LANGSMITH_TRACING: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  LANGSMITH_ENDPOINT: z.string().url().default('https://api.smith.langchain.com'),
  LANGSMITH_API_KEY: z.string().min(1),
  LANGSMITH_PROJECT: z.string().default('api-generator-agent'),
  MAX_FIX_ITERATIONS: z.coerce.number().int().min(1).max(20).default(5),
  MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
  WORKSPACE_DIR: z.string().default('.workspace'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(10000).max(3600000).default(1800000),
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
