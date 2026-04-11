import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

export function renderServer(projectName: string, features: IFeatureSpec[]): string {
  const routerImports: string[] = [];
  const routerUses: string[] = [];

  for (const feature of features) {
    for (const entity of feature.entities) {
      const pascal = toPascalCase(entity.name);
      const kebab = toKebabCase(entity.name);
      const camel = toCamelCase(entity.name);
      const pluralKebab = toKebabCase(entity.pluralName);

      routerImports.push(
        `import { create${pascal}Router } from "./features/${feature.domain}/router/${pluralKebab}-router.mjs";`,
      );
      routerUses.push(
        `    .use(create${pascal}Router(container.logger, container.services.${camel}Service))`,
      );
    }
  }

  return `import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { getContainer } from "./ioc/get-container.mjs";
import { tracePlugin } from "./api/plugins/trace.plugin.mjs";
import { env } from "./env.mjs";
${routerImports.join("\n")}

async function main(): Promise<void> {
  const container = await getContainer();
  const { logger } = container;

  const app = new Elysia()
    .use(cors())
    .use(openapi({ path: "/swagger", provider: "scalar" }))
    .use(tracePlugin(logger))
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
${routerUses.join("\n")}
    .listen(env.PORT);

  logger.info(\`[${projectName}] Server started on port \${env.PORT}\`);
  logger.info(\`[${projectName}] Swagger UI: http://localhost:\${env.PORT}/swagger\`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(\`Fatal: \${msg}\\n\`);
  process.exit(1);
});
`;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
