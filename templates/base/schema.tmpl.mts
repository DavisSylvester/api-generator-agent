import type { IEntitySpec, IFieldSpec } from "../../src/core/interfaces/index.mts";

function mapTypeBoxType(field: IFieldSpec): string {
  const typeMap: Record<string, string> = {
    "string": "Type.String()",
    "number": "Type.Number()",
    "boolean": "Type.Boolean()",
    "date": "Type.String({ format: \"date-time\" })",
    "datetime": "Type.String({ format: \"date-time\" })",
    "email": "Type.String({ pattern: \"^[\\\\w.-]+@[\\\\w.-]+\\\\.[a-zA-Z]{2,}$\" })",
    "url": "Type.String({ format: \"uri\" })",
    "uuid": "Type.String({ minLength: 26, maxLength: 26 })",
    "ulid": "Type.String({ minLength: 26, maxLength: 26 })",
    "object": "Type.Record(Type.String(), Type.Unknown())",
    "array": "Type.Array(Type.Unknown())",
  };
  const base = typeMap[field.type.toLowerCase()] ?? "Type.String()";
  return field.required ? base : `Type.Optional(${base})`;
}

export function renderValidationSchema(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);

  const createFields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => `  ${f.name}: ${mapTypeBoxType(f)},`)
    .join("\n");

  const updateFields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => {
      const base = mapTypeBoxType(f);
      return `  ${f.name}: ${base.startsWith("Type.Optional(") ? base : `Type.Optional(${base})`},`;
    })
    .join("\n");

  return `import { Type, Static } from "@sinclair/typebox";

export const create${pascal}Schema = Type.Object({
${createFields}
});

export type Create${pascal}Input = Static<typeof create${pascal}Schema>;

export const update${pascal}Schema = Type.Object({
${updateFields}
});

export type Update${pascal}Input = Static<typeof update${pascal}Schema>;

export const ${toCamelCase(entity.name)}IdParamSchema = Type.Object({
  id: Type.String({ minLength: 26, maxLength: 26 }),
});

export type ${pascal}IdParam = Static<typeof ${toCamelCase(entity.name)}IdParamSchema>;

export const ${toCamelCase(entity.name)}QuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

export type ${pascal}Query = Static<typeof ${toCamelCase(entity.name)}QuerySchema>;
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
