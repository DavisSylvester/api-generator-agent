import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

export function renderService(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const camel = toCamelCase(entity.name);

  return `import type { Logger } from "winston";
import type { ${pascal}Repository } from "../repository/${kebab}-repository.mjs";
import type { I${pascal} } from "../interfaces/i-${kebab}.mjs";
import type { Create${pascal}Input, Update${pascal}Input } from "../validation/${kebab}.validation.mjs";

export class ${pascal}Service {

  private readonly repository: ${pascal}Repository;
  private readonly logger: Logger;

  constructor(repository: ${pascal}Repository, logger: Logger) {
    this.repository = repository;
    this.logger = logger;
  }

  public async create(input: Create${pascal}Input): Promise<I${pascal}> {
    this.logger.info(\`[${pascal}Service] Creating ${entity.name}\`);
    return this.repository.create(input);
  }

  public async findById(id: string): Promise<I${pascal} | null> {
    this.logger.info(\`[${pascal}Service] Finding ${entity.name} by id: \${id}\`);
    return this.repository.findById(id);
  }

  public async findAll(page: number, limit: number): Promise<{ data: I${pascal}[]; total: number }> {
    this.logger.info(\`[${pascal}Service] Finding all ${entity.pluralName} (page=\${page}, limit=\${limit})\`);
    return this.repository.findAll(page, limit);
  }

  public async update(id: string, input: Update${pascal}Input): Promise<I${pascal} | null> {
    this.logger.info(\`[${pascal}Service] Updating ${entity.name}: \${id}\`);
    return this.repository.update(id, input);
  }

  public async delete(id: string): Promise<boolean> {
    this.logger.info(\`[${pascal}Service] Deleting ${entity.name}: \${id}\`);
    return this.repository.delete(id);
  }
}
`;
}

export function renderServiceInterface(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);

  return `import type { I${pascal} } from "../interfaces/i-${kebab}.mjs";
import type { Create${pascal}Input, Update${pascal}Input } from "../validation/${kebab}.validation.mjs";

export interface I${pascal}Service {

  create(input: Create${pascal}Input): Promise<I${pascal}>;
  findById(id: string): Promise<I${pascal} | null>;
  findAll(page: number, limit: number): Promise<{ data: I${pascal}[]; total: number }>;
  update(id: string, input: Update${pascal}Input): Promise<I${pascal} | null>;
  delete(id: string): Promise<boolean>;
}
`;
}

export function renderServiceBarrel(entity: IEntitySpec): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  return [
    `export { ${pascal}Service } from "./${kebab}-service.mjs";`,
    `export type { I${pascal}Service } from "./i-${kebab}-service.mjs";`,
  ].join("\n") + "\n";
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
