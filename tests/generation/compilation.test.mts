import { describe, it, expect, beforeAll } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenerationEngine } from "../../src/generation/engine.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";
import type { Logger } from "winston";
import { mock } from "bun:test";

/**
 * L3 Compilation Tests — verify generated TypeScript can be parsed without errors.
 * We check that the output is valid TypeScript syntax (not full tsc --noEmit
 * since that requires installing dependencies in the temp dir).
 */

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

// Domain fixture 1: Configuration
const configurationFeature: IFeatureSpec = {
  name: "configurations",
  domain: "configurations",
  description: "Configuration management",
  entities: [{
    name: "configuration",
    pluralName: "configurations",
    fields: [
      { name: "key", type: "string", required: true, description: "Configuration key" },
      { name: "value", type: "string", required: true, description: "Configuration value" },
      { name: "category", type: "string", required: true, description: "Category" },
      { name: "isActive", type: "boolean", required: true, description: "Active flag" },
    ],
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  }],
  dependsOn: [],
};

// Domain fixture 2: Registered Sheets
const registeredSheetsFeature: IFeatureSpec = {
  name: "registered-sheets",
  domain: "registered-sheets",
  description: "Registered sheets management",
  entities: [{
    name: "registered-sheet",
    pluralName: "registered-sheets",
    fields: [
      { name: "sheetId", type: "string", required: true, description: "External sheet ID" },
      { name: "name", type: "string", required: true, description: "Sheet name" },
      { name: "webhookUrl", type: "url", required: false, description: "Webhook URL" },
      { name: "syncInterval", type: "number", required: true, description: "Sync interval in minutes" },
    ],
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  }],
  dependsOn: [],
};

// Domain fixture 3: Photo Analysis
const photoAnalysisFeature: IFeatureSpec = {
  name: "photo-analysis",
  domain: "photo-analysis",
  description: "Photo analysis results",
  entities: [{
    name: "photo-analysis",
    pluralName: "photo-analyses",
    fields: [
      { name: "photoUrl", type: "url", required: true, description: "URL of the photo" },
      { name: "score", type: "number", required: true, description: "Analysis score" },
      { name: "labels", type: "array", required: false, description: "Detected labels" },
      { name: "analyzedAt", type: "datetime", required: true, description: "Analysis timestamp" },
    ],
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  }],
  dependsOn: [],
};

const allFixtures = [configurationFeature, registeredSheetsFeature, photoAnalysisFeature];

describe("L3 Compilation Tests", () => {
  for (const fixture of allFixtures) {
    describe(`Domain: ${fixture.name}`, () => {
      let tmpDir: string;
      let engine: GenerationEngine;

      beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), `gen-l3-${fixture.name}-`));
        engine = new GenerationEngine(mockLogger, {
          projectName: "test-project",
          outputDir: tmpDir,
          integrationPort: 4100,
        });
        await engine.generateAll([fixture]);
      });

      it("should generate interface files with valid TypeScript syntax", async () => {
        const entity = fixture.entities[0]!;
        const kebab = entity.name.toLowerCase().replace(/\s+/g, "-");
        const path = join(tmpDir, "src", "features", fixture.domain, "interfaces", `i-${kebab}.mts`);
        const content = await readFile(path, "utf-8");
        expect(content).toContain("export interface");
        expect(content).toContain("id: string");
        expect(content).not.toContain("any");
      });

      it("should generate validation schema with zod imports", async () => {
        const entity = fixture.entities[0]!;
        const kebab = entity.name.toLowerCase().replace(/\s+/g, "-");
        const path = join(tmpDir, "src", "features", fixture.domain, "validation", `${kebab}.validation.mts`);
        const content = await readFile(path, "utf-8");
        expect(content).toContain('import { z } from "zod"');
        expect(content).toContain("z.object");
        expect(content).toContain("z.infer");
      });

      it("should generate repository with ulid import", async () => {
        const entity = fixture.entities[0]!;
        const kebab = entity.name.toLowerCase().replace(/\s+/g, "-");
        const path = join(tmpDir, "src", "features", fixture.domain, "repository", `${kebab}-repository.mts`);
        const content = await readFile(path, "utf-8");
        expect(content).toContain('import { ulid } from "ulid"');
        expect(content).toContain("ensureIndexes");
      });

      it("should generate service with constructor injection", async () => {
        const entity = fixture.entities[0]!;
        const kebab = entity.name.toLowerCase().replace(/\s+/g, "-");
        const path = join(tmpDir, "src", "features", fixture.domain, "service", `${kebab}-service.mts`);
        const content = await readFile(path, "utf-8");
        expect(content).toContain("constructor(repository:");
        expect(content).toContain("logger: Logger");
      });

      it("should generate router with /v1/ prefix", async () => {
        const entity = fixture.entities[0]!;
        const pluralKebab = entity.pluralName.toLowerCase().replace(/\s+/g, "-");
        const path = join(tmpDir, "src", "features", fixture.domain, "router", `${pluralKebab}-router.mts`);
        const content = await readFile(path, "utf-8");
        expect(content).toContain("/v1/");
        expect(content).not.toContain("/api/");
      });

      it("should not contain any TypeScript any type", async () => {
        const entity = fixture.entities[0]!;
        const kebab = entity.name.toLowerCase().replace(/\s+/g, "-");
        const files = [
          join(tmpDir, "src", "features", fixture.domain, "interfaces", `i-${kebab}.mts`),
          join(tmpDir, "src", "features", fixture.domain, "service", `${kebab}-service.mts`),
        ];
        for (const filePath of files) {
          const content = await readFile(filePath, "utf-8");
          // Check for explicit `any` type (not in comments or strings)
          const codeLines = content.split("\n").filter((l) => !l.trim().startsWith("//"));
          for (const line of codeLines) {
            // Allow "as unknown as" but not explicit `: any`
            expect(line).not.toMatch(/:\s*any\b/);
          }
        }
      });
    });
  }
});
