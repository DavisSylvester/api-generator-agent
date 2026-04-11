import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

export function renderContainer(projectName: string, features: IFeatureSpec[]): string {
  const imports: string[] = [];
  const repoInits: string[] = [];
  const serviceInits: string[] = [];
  const repoProps: string[] = [];
  const serviceProps: string[] = [];
  const interfaceRepoProps: string[] = [];
  const interfaceServiceProps: string[] = [];

  for (const feature of features) {
    for (const entity of feature.entities) {
      const pascal = toPascalCase(entity.name);
      const kebab = toKebabCase(entity.name);
      const camel = toCamelCase(entity.name);

      imports.push(
        `import { ${pascal}Repository } from "../features/${feature.domain}/repository/${kebab}-repository.mjs";`,
      );
      imports.push(
        `import { ${pascal}Service } from "../features/${feature.domain}/service/${kebab}-service.mjs";`,
      );

      repoInits.push(`  const ${camel}Repository = new ${pascal}Repository(db, logger);`);
      repoInits.push(`  await ${camel}Repository.ensureIndexes();`);

      serviceInits.push(`  const ${camel}Service = new ${pascal}Service(${camel}Repository, logger);`);

      repoProps.push(`    ${camel}Repository,`);
      serviceProps.push(`    ${camel}Service,`);

      interfaceRepoProps.push(`  ${camel}Repository: ${pascal}Repository;`);
      interfaceServiceProps.push(`  ${camel}Service: ${pascal}Service;`);
    }
  }

  return `import { MongoClient } from "mongodb";
import type { Db } from "mongodb";
import type { Logger } from "winston";
import { createLogger } from "../loggers/logger.mjs";
import { createDatabaseConfiguration } from "./create-database-configuration.mjs";
import type { DatabaseConfig } from "./create-database-configuration.mjs";
${imports.join("\n")}

export interface IContainer {

  db: Db;
  databaseConfig: DatabaseConfig;
  logger: Logger;
  repositories: {
${interfaceRepoProps.join("\n")}
  };
  services: {
${interfaceServiceProps.join("\n")}
  };
}

export async function getContainer(): Promise<IContainer> {
  const logger = createLogger();
  const databaseConfig = createDatabaseConfiguration();
  const client = new MongoClient(databaseConfig.uri);
  await client.connect();
  const db = client.db(databaseConfig.dbName);
  logger.info("[container] Connected to MongoDB");

${repoInits.join("\n")}

${serviceInits.join("\n")}

  return {
    db,
    databaseConfig,
    logger,
    repositories: {
${repoProps.join("\n")}
    },
    services: {
${serviceProps.join("\n")}
    },
  };
}
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
