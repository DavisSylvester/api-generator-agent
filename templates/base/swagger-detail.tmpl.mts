import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

export function renderSwaggerDetail(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const pluralKebab = toKebabCase(entity.pluralName);
  const camel = toCamelCase(entity.name);

  const fieldProperties = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => {
      const type = mapOpenApiType(f.type);
      return `    ${f.name}: { type: "${type}"${f.description ? `, description: "${f.description}"` : ""} },`;
    })
    .join("\n");

  return `export const ${camel}SwaggerTags = ["${pascal}"] as const;

export const ${camel}SwaggerDetail = {
  list: {
    tags: [...${camel}SwaggerTags],
    summary: "List all ${entity.pluralName}",
    description: "Retrieve a paginated list of ${entity.pluralName}",
  },
  getById: {
    tags: [...${camel}SwaggerTags],
    summary: "Get ${entity.name} by ID",
    description: "Retrieve a single ${entity.name} by its ULID",
  },
  create: {
    tags: [...${camel}SwaggerTags],
    summary: "Create a new ${entity.name}",
    description: "Create a new ${entity.name} with the provided data",
  },
  update: {
    tags: [...${camel}SwaggerTags],
    summary: "Update a ${entity.name}",
    description: "Update an existing ${entity.name} by its ULID",
  },
  delete: {
    tags: [...${camel}SwaggerTags],
    summary: "Delete a ${entity.name}",
    description: "Delete a ${entity.name} by its ULID",
  },
} as const;

export const ${camel}CreateBody = {
  type: "object" as const,
  required: [${entity.fields.filter((f) => f.required && f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt").map((f) => `"${f.name}"`).join(", ")}],
  properties: {
${fieldProperties}
  },
};
`;
}

function mapOpenApiType(fieldType: string): string {
  const typeMap: Record<string, string> = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "date": "string",
    "datetime": "string",
    "email": "string",
    "url": "string",
    "uuid": "string",
    "ulid": "string",
    "object": "object",
    "array": "array",
  };
  return typeMap[fieldType.toLowerCase()] ?? "string";
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
