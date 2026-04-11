export function renderEnvConfig(projectName: string): string {
  const dbName = toKebabCase(projectName);

  return `import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const envSchema = Type.Object({
  PORT: Type.Optional(Type.String({ default: "3000" })),
  MONGODB_URI: Type.Optional(Type.String({ default: "mongodb://localhost:27017/${dbName}" })),
  NODE_ENV: Type.Optional(Type.Union([
    Type.Literal("development"),
    Type.Literal("test"),
    Type.Literal("production"),
  ], { default: "development" })),
  JWT_SECRET: Type.Optional(Type.String({ minLength: 32, default: "dev-secret-key-that-is-at-least-32-chars" })),
});

export type EnvConfig = Static<typeof envSchema>;

export function loadEnv(): EnvConfig {
  const raw = Value.Default(envSchema, { ...Bun.env });
  if (!Value.Check(envSchema, raw)) {
    const errors = [...Value.Errors(envSchema, raw)];
    const formatted = errors
      .map((e) => \`  \${e.path}: \${e.message}\`)
      .join("\\n");
    throw new Error(\`Environment validation failed:\\n\${formatted}\`);
  }
  return raw as EnvConfig;
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
    uri: env.MONGODB_URI ?? "mongodb://localhost:27017/my-app",
    dbName: new URL(env.MONGODB_URI ?? "mongodb://localhost:27017/my-app").pathname.replace("/", "") || "my-app",
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
