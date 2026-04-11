import type { IEntitySpec, IFieldSpec } from "../../src/core/interfaces/index.mts";

function mapFieldType(field: IFieldSpec): string {
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
    "object": "Record<string, unknown>",
    "array": "unknown[]",
  };
  return typeMap[field.type.toLowerCase()] ?? "string";
}

export function renderInterface(entity: IEntitySpec, domain: string): string {
  const interfaceName = `I${toPascalCase(entity.name)}`;
  const fields = entity.fields.map((f) => {
    const tsType = mapFieldType(f);
    const optional = f.required ? "" : "?";
    const comment = f.description ? `  /** ${f.description} */\n` : "";
    return `${comment}  ${f.name}${optional}: ${tsType};`;
  }).join("\n");

  return `${interfaceName}|export interface ${interfaceName} {

  id: string;
${fields}
  createdAt: string;
  updatedAt: string;
}
`;
}

export function renderCreateDto(entity: IEntitySpec, domain: string): string {
  const dtoName = `ICreate${toPascalCase(entity.name)}`;
  const interfaceName = `I${toPascalCase(entity.name)}`;
  const fields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => {
      const tsType = mapFieldType(f);
      const optional = f.required ? "" : "?";
      return `  ${f.name}${optional}: ${tsType};`;
    }).join("\n");

  return `${dtoName}|import type { ${interfaceName} } from "./i-${toKebabCase(entity.name)}.mjs";

export interface ${dtoName} {

${fields}
}
`;
}

export function renderUpdateDto(entity: IEntitySpec, domain: string): string {
  const dtoName = `IUpdate${toPascalCase(entity.name)}`;
  const fields = entity.fields
    .filter((f) => f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => {
      const tsType = mapFieldType(f);
      return `  ${f.name}?: ${tsType};`;
    }).join("\n");

  return `${dtoName}|export interface ${dtoName} {

${fields}
}
`;
}

export function renderInterfaceBarrel(entity: IEntitySpec): string {
  const kebab = toKebabCase(entity.name);
  const lines = [
    `export type { I${toPascalCase(entity.name)} } from "./i-${kebab}.mjs";`,
    `export type { ICreate${toPascalCase(entity.name)} } from "./i-create-${kebab}.mjs";`,
    `export type { IUpdate${toPascalCase(entity.name)} } from "./i-update-${kebab}.mjs";`,
  ];
  return lines.join("\n") + "\n";
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
