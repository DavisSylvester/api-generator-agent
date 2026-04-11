export function renderEnvConfig(projectName: string): string {
  const dbName = toKebabCase(projectName);

  return `import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().url().default("mongodb://localhost:27017/${dbName}"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(32).default("dev-secret-key-that-is-at-least-32-chars"),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(Bun.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => \`  \${i.path.join(".")}: \${i.message}\`)
      .join("\\n");
    throw new Error(\`Environment validation failed:\\n\${formatted}\`);
  }
  return result.data;
}

export const env = loadEnv();
`;
}

export function renderDatabaseConfig(): string {
  return `import { env } from "../env.mjs";

export interface DatabaseConfig {
  uri: string;
  dbName: string;
}

export function createDatabaseConfiguration(): DatabaseConfig {
  return {
    uri: env.MONGODB_URI,
    dbName: new URL(env.MONGODB_URI).pathname.replace("/", "") || "my-app",
  };
}
`;
}

export function renderEnvExample(projectName: string): string {
  const dbName = toKebabCase(projectName);

  return `PORT=3000
MONGODB_URI=mongodb://localhost:27017/${dbName}
NODE_ENV=development
JWT_SECRET=dev-secret-key-that-is-at-least-32-chars-long
`;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
