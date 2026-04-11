import { describe, it, expect, beforeEach, mock } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenerationEngine } from "../../src/generation/engine.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

const sampleFeatures: IFeatureSpec[] = [
  {
    name: "work-orders",
    domain: "work-orders",
    description: "Work order management",
    entities: [{
      name: "work-order",
      pluralName: "work-orders",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: true },
        { name: "description", type: "string", required: false },
      ],
      relationships: [],
      operations: ["create", "read", "update", "delete", "list"],
    }],
    dependsOn: [],
  },
];

describe("GenerationEngine", () => {
  let tmpDir: string;
  let engine: GenerationEngine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gen-engine-test-"));
    engine = new GenerationEngine(mockLogger, {
      projectName: "test-project",
      outputDir: tmpDir,
      integrationPort: 4100,
    });
  });

  describe("generateAll", () => {
    it("should generate infrastructure and feature files", async () => {
      const result = await engine.generateAll(sampleFeatures);
      expect(result.projectName).toBe("test-project");
      expect(result.totalFiles).toBeGreaterThan(20); // 14 infra + 16 feature files
      expect(result.errors).toHaveLength(0);
      expect(result.features).toHaveLength(1);
      expect(result.features[0]?.featureName).toBe("work-orders");
    });

    it("should write files to disk", async () => {
      await engine.generateAll(sampleFeatures);
      const packageJson = await readFile(join(tmpDir, "package.json"), "utf-8");
      const parsed = JSON.parse(packageJson);
      expect(parsed.name).toBe("@test-project/api");
    });

    it("should generate env.mts with Zod validation", async () => {
      await engine.generateAll(sampleFeatures);
      const envContent = await readFile(join(tmpDir, "src", "env.mts"), "utf-8");
      expect(envContent).toContain("z.object");
      expect(envContent).toContain("loadEnv");
    });

    it("should generate docker-compose.yml", async () => {
      await engine.generateAll(sampleFeatures);
      const dockerCompose = await readFile(join(tmpDir, "docker-compose.yml"), "utf-8");
      expect(dockerCompose).toContain("mongo:7");
    });
  });

  describe("generateFeature", () => {
    it("should generate all layers for a feature", async () => {
      const result = await engine.generateFeature(sampleFeatures[0]!);
      expect(result.featureName).toBe("work-orders");
      expect(result.filesGenerated.length).toBeGreaterThanOrEqual(14); // All layers
      expect(result.errors).toHaveLength(0);
    });

    it("should create feature directory structure", async () => {
      await engine.generateFeature(sampleFeatures[0]!);
      const featureDir = join(tmpDir, "src", "features", "work-orders");
      const entries = await readdir(featureDir);
      expect(entries).toContain("interfaces");
      expect(entries).toContain("validation");
      expect(entries).toContain("repository");
      expect(entries).toContain("service");
      expect(entries).toContain("router");
      expect(entries).toContain("docs");
    });
  });

  describe("generateInfrastructure", () => {
    it("should generate all infrastructure files", async () => {
      const files = await engine.generateInfrastructure(sampleFeatures);
      expect(files.length).toBe(14);
      expect(files).toContain("src/env.mts");
      expect(files).toContain("src/index.mts");
      expect(files).toContain("package.json");
      expect(files).toContain("docker-compose.yml");
    });

    it("should wire features into container", async () => {
      await engine.generateInfrastructure(sampleFeatures);
      const containerContent = await readFile(
        join(tmpDir, "src", "ioc", "get-container.mts"), "utf-8",
      );
      expect(containerContent).toContain("WorkOrderRepository");
      expect(containerContent).toContain("WorkOrderService");
    });
  });

  describe("multi-feature generation", () => {
    it("should handle multiple features", async () => {
      const multiFeatures: IFeatureSpec[] = [
        ...sampleFeatures,
        {
          name: "users",
          domain: "users",
          description: "User management",
          entities: [{
            name: "user",
            pluralName: "users",
            fields: [
              { name: "email", type: "email", required: true },
              { name: "name", type: "string", required: true },
            ],
            relationships: [],
            operations: ["create", "read", "update", "delete", "list"],
          }],
          dependsOn: [],
        },
      ];

      const result = await engine.generateAll(multiFeatures);
      expect(result.features).toHaveLength(2);
      expect(result.totalFiles).toBeGreaterThan(40); // 14 infra + 16 per feature
    });
  });
});
