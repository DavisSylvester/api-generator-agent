import type { IEntitySpec, IFieldSpec } from "../../src/core/interfaces/index.mts";

export function renderRepository(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const camel = toCamelCase(entity.name);
  const collectionName = toKebabCase(entity.pluralName);

  const uniqueFields = entity.fields
    .filter((f) => f.name === "email" || f.name === "slug" || f.name === "code")
    .map((f) => f.name);

  const indexLines = uniqueFields.length > 0
    ? uniqueFields.map((f) =>
      `      this.collection.createIndex({ ${f}: 1 }, { unique: true }),`,
    ).join("\n")
    : `      this.collection.createIndex({ createdAt: -1 }),`;

  return `import { ulid } from "ulid";
import type { Collection, Db } from "mongodb";
import type { Logger } from "winston";
import type { I${pascal} } from "../interfaces/i-${kebab}.mjs";
import type { Create${pascal}Input, Update${pascal}Input } from "../validation/${kebab}.validation.mjs";

export class ${pascal}Repository {

  private readonly collection: Collection<I${pascal}>;
  private readonly logger: Logger;

  constructor(db: Db, logger: Logger) {
    this.collection = db.collection<I${pascal}>("${collectionName}");
    this.logger = logger;
  }

  public async ensureIndexes(): Promise<void> {
    await Promise.all([
${indexLines}
    ]);
    this.logger.info("[${pascal}Repository] Indexes ensured");
  }

  public async create(input: Create${pascal}Input): Promise<I${pascal}> {
    const now = new Date().toISOString();
    const doc: I${pascal} = {
      ...input,
      id: ulid(),
      createdAt: now,
      updatedAt: now,
    } as I${pascal};
    await this.collection.insertOne(doc as Record<string, unknown> & { _id?: unknown });
    this.logger.info(\`[${pascal}Repository] Created \${doc.id}\`);
    return doc;
  }

  public async findById(id: string): Promise<I${pascal} | null> {
    const doc = await this.collection.findOne({ id } as Record<string, unknown>);
    return doc ?? null;
  }

  public async findAll(page: number, limit: number): Promise<{ data: I${pascal}[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.collection
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments({}),
    ]);
    return { data: data as unknown as I${pascal}[], total };
  }

  public async update(id: string, input: Update${pascal}Input): Promise<I${pascal} | null> {
    const now = new Date().toISOString();
    const result = await this.collection.findOneAndUpdate(
      { id } as Record<string, unknown>,
      { $set: { ...input, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (result) {
      this.logger.info(\`[${pascal}Repository] Updated \${id}\`);
    }
    return (result as unknown as I${pascal}) ?? null;
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ id } as Record<string, unknown>);
    if (result.deletedCount > 0) {
      this.logger.info(\`[${pascal}Repository] Deleted \${id}\`);
      return true;
    }
    return false;
  }
}
`;
}

export function renderRepositoryBarrel(entity: IEntitySpec): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  return `export { ${pascal}Repository } from "./${kebab}-repository.mjs";\n`;
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
