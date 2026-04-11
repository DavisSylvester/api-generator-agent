import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

export function renderServiceTest(entity: IEntitySpec, domain: string): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const camel = toCamelCase(entity.name);

  const sampleFields = entity.fields
    .filter((f) => f.required && f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => `    ${f.name}: ${getSampleValue(f.type)},`)
    .join("\n");

  return `import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ${pascal}Service } from "../src/features/${domain}/service/${kebab}-service.mjs";
import type { ${pascal}Repository } from "../src/features/${domain}/repository/${kebab}-repository.mjs";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

const sampleInput = {
${sampleFields}
};

const sampleEntity = {
  id: "01ARYZ6S41TSV4RRFFQ69G5FAV",
  ...sampleInput,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("${pascal}Service", () => {
  let service: ${pascal}Service;
  let mockRepo: ${pascal}Repository;

  beforeEach(() => {
    mockRepo = {
      create: mock(() => Promise.resolve(sampleEntity)),
      findById: mock(() => Promise.resolve(sampleEntity)),
      findAll: mock(() => Promise.resolve({ data: [sampleEntity], total: 1 })),
      update: mock(() => Promise.resolve(sampleEntity)),
      delete: mock(() => Promise.resolve(true)),
      ensureIndexes: mock(() => Promise.resolve()),
    } as unknown as ${pascal}Repository;

    service = new ${pascal}Service(mockRepo, mockLogger);
  });

  it("should create a ${entity.name}", async () => {
    const result = await service.create(sampleInput);
    expect(result).toBeDefined();
    expect(result.id).toBe(sampleEntity.id);
  });

  it("should find a ${entity.name} by id", async () => {
    const result = await service.findById("01ARYZ6S41TSV4RRFFQ69G5FAV");
    expect(result).toBeDefined();
    expect(result?.id).toBe(sampleEntity.id);
  });

  it("should find all ${entity.pluralName}", async () => {
    const result = await service.findAll(1, 20);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("should update a ${entity.name}", async () => {
    const result = await service.update("01ARYZ6S41TSV4RRFFQ69G5FAV", sampleInput);
    expect(result).toBeDefined();
  });

  it("should delete a ${entity.name}", async () => {
    const result = await service.delete("01ARYZ6S41TSV4RRFFQ69G5FAV");
    expect(result).toBe(true);
  });

  it("should return null when ${entity.name} not found", async () => {
    mockRepo.findById = mock(() => Promise.resolve(null));
    service = new ${pascal}Service(mockRepo, mockLogger);
    const result = await service.findById("non-existent");
    expect(result).toBeNull();
  });
});
`;
}

export function renderIntegrationTest(entity: IEntitySpec, domain: string, port: number): string {
  const pascal = toPascalCase(entity.name);
  const kebab = toKebabCase(entity.name);
  const pluralKebab = toKebabCase(entity.pluralName);

  const sampleFields = entity.fields
    .filter((f) => f.required && f.name !== "id" && f.name !== "createdAt" && f.name !== "updatedAt")
    .map((f) => `    ${f.name}: ${getSampleValue(f.type)},`)
    .join("\n");

  return `import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const BASE_URL = "http://localhost:${port}/v1/${pluralKebab}";

const sampleInput = {
${sampleFields}
};

describe("${pascal} Integration Tests", () => {
  let createdId: string;

  it("should create a ${entity.name} via POST", async () => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInput),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { success: boolean; data: { id: string } };
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    createdId = json.data.id;
  });

  it("should list ${entity.pluralName} via GET", async () => {
    const res = await fetch(BASE_URL);
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: unknown[]; count: number };
    expect(json.success).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(1);
  });

  it("should get ${entity.name} by ID via GET", async () => {
    const res = await fetch(\`\${BASE_URL}/\${createdId}\`);
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: { id: string } };
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(createdId);
  });

  it("should update ${entity.name} via PUT", async () => {
    const res = await fetch(\`\${BASE_URL}/\${createdId}\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInput),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: { id: string } };
    expect(json.success).toBe(true);
  });

  it("should delete ${entity.name} via DELETE", async () => {
    const res = await fetch(\`\${BASE_URL}/\${createdId}\`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: { deleted: boolean } };
    expect(json.success).toBe(true);
  });

  it("should return 404 for deleted ${entity.name}", async () => {
    const res = await fetch(\`\${BASE_URL}/\${createdId}\`);
    expect(res.status).toBe(404);
    const json = await res.json() as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });

  it("should return 400 for invalid body on POST", async () => {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { success: boolean; error: string };
    expect(json.success).toBe(false);
  });
});
`;
}

function getSampleValue(fieldType: string): string {
  const valueMap: Record<string, string> = {
    "string": `"test-value"`,
    "number": "42",
    "boolean": "true",
    "date": `"2026-01-01T00:00:00.000Z"`,
    "datetime": `"2026-01-01T00:00:00.000Z"`,
    "email": `"test@example.com"`,
    "url": `"https://example.com"`,
    "uuid": `"01ARYZ6S41TSV4RRFFQ69G5FAV"`,
    "ulid": `"01ARYZ6S41TSV4RRFFQ69G5FAV"`,
  };
  return valueMap[fieldType.toLowerCase()] ?? `"test-value"`;
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
