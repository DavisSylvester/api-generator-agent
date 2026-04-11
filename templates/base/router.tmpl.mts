import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

export function renderRouter(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const camel = toCamelCase(entity.name);
  const pluralKebab = toKebabCase(entity.pluralName);

  return `import { Elysia, t } from "elysia";
import type { Logger } from "winston";
import type { ${pascal}Service } from "../service/${kebab}-service.mjs";
import {
  create${pascal}Schema,
  update${pascal}Schema,
  ${camel}IdParamSchema,
  ${camel}QuerySchema,
} from "../validation/${kebab}.validation.mjs";

export function create${pascal}Router(
  logger: Logger,
  service: ${pascal}Service,
): Elysia {
  return new Elysia({ prefix: "/v1/${pluralKebab}" })
    .post("/", async ({ body, set }) => {
      try {
        const parsed = create${pascal}Schema.parse(body);
        const result = await service.create(parsed);
        set.status = 201;
        return { success: true, data: result };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(\`[${pascal}Router] POST / failed: \${msg}\`);
        set.status = 400;
        return { success: false, error: msg };
      }
    })
    .get("/", async ({ query, set }) => {
      try {
        const parsed = ${camel}QuerySchema.parse(query);
        const result = await service.findAll(parsed.page, parsed.limit);
        return { success: true, data: result.data, count: result.total };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(\`[${pascal}Router] GET / failed: \${msg}\`);
        set.status = 400;
        return { success: false, error: msg };
      }
    })
    .get("/:id", async ({ params, set }) => {
      try {
        const parsed = ${camel}IdParamSchema.parse(params);
        const result = await service.findById(parsed.id);
        if (!result) {
          set.status = 404;
          return { success: false, error: "${pascal} not found" };
        }
        return { success: true, data: result };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(\`[${pascal}Router] GET /:id failed: \${msg}\`);
        set.status = 400;
        return { success: false, error: msg };
      }
    })
    .put("/:id", async ({ params, body, set }) => {
      try {
        const parsedParams = ${camel}IdParamSchema.parse(params);
        const parsedBody = update${pascal}Schema.parse(body);
        const result = await service.update(parsedParams.id, parsedBody);
        if (!result) {
          set.status = 404;
          return { success: false, error: "${pascal} not found" };
        }
        return { success: true, data: result };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(\`[${pascal}Router] PUT /:id failed: \${msg}\`);
        set.status = 400;
        return { success: false, error: msg };
      }
    })
    .delete("/:id", async ({ params, set }) => {
      try {
        const parsed = ${camel}IdParamSchema.parse(params);
        const deleted = await service.delete(parsed.id);
        if (!deleted) {
          set.status = 404;
          return { success: false, error: "${pascal} not found" };
        }
        return { success: true, data: { id: parsed.id, deleted: true } };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(\`[${pascal}Router] DELETE /:id failed: \${msg}\`);
        set.status = 400;
        return { success: false, error: msg };
      }
    });
}
`;
}

export function renderRouterBarrel(entity: IEntitySpec): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const pluralKebab = toKebabCase(entity.pluralName);
  return `export { create${pascal}Router } from "./${pluralKebab}-router.mjs";\n`;
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
