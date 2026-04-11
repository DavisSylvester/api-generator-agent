import type { IEntitySpec, IFieldSpec } from "../../src/core/interfaces/index.mts";

function mapZodType(field: IFieldSpec): string {
  const typeMap: Record<string, string> = {
    "string": "z.string()",
    "number": "z.number()",
    "boolean": "z.boolean()",
    "date": "z.string().datetime()",
    "datetime": "z.string().datetime()",
    "email": "z.string().email()",
    "url": "z.string().url()",
    "uuid": "z.string().ulid()",
    "ulid": "z.string().ulid()",
    "object": "z.record(z.string(), z.unknown())",
    "array": "z.array(z.unknown())",
  };
  const base = typeMap[field.type.toLowerCase()] ?? "z.string()";
  return field.required ? base : `${base}.optional()`;
}

export function renderValidationSchema(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);

  const createFields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => `  ${f.name}: ${mapZodType(f)},`)
    .join("\n");

  const updateFields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => {
      const base = mapZodType(f);
      return `  ${f.name}: ${base.includes(".optional()") ? base : `${base}.optional()`},`;
    })
    .join("\n");

  return `import { z } from "zod";

export const create${pascal}Schema = z.object({
${createFields}
});

export type Create${pascal}Input = z.infer<typeof create${pascal}Schema>;

export const update${pascal}Schema = z.object({
${updateFields}
});

export type Update${pascal}Input = z.infer<typeof update${pascal}Schema>;

export const ${toCamelCase(entity.name)}IdParamSchema = z.object({
  id: z.string().ulid(),
});

export type ${pascal}IdParam = z.infer<typeof ${toCamelCase(entity.name)}IdParamSchema>;

export const ${toCamelCase(entity.name)}QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ${pascal}Query = z.infer<typeof ${toCamelCase(entity.name)}QuerySchema>;
`;
}

export function renderSchemaBarrel(entity: IEntitySpec): string {
  const kebab = toKebabCase(entity.name);
  return `export {
  create${toPascalCase(entity.name)}Schema,
  update${toPascalCase(entity.name)}Schema,
  ${toCamelCase(entity.name)}IdParamSchema,
  ${toCamelCase(entity.name)}QuerySchema,
} from "./${kebab}.validation.mjs";

export type {
  Create${toPascalCase(entity.name)}Input,
  Update${toPascalCase(entity.name)}Input,
  ${toPascalCase(entity.name)}IdParam,
  ${toPascalCase(entity.name)}Query,
} from "./${kebab}.validation.mjs";
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
