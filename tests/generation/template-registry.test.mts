import { describe, it, expect } from "bun:test";
import { TemplateRegistry } from "../../src/generation/template-registry.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "work-orders",
  domain: "work-orders",
  description: "Work order management",
  entities: [{
    name: "work-order",
    pluralName: "work-orders",
    fields: [
      { name: "title", type: "string", required: true },
      { name: "status", type: "string", required: true },
    ],
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  }],
  dependsOn: [],
};

describe("TemplateRegistry", () => {
  const registry = new TemplateRegistry();

  describe("renderFeatureLayer - interface", () => {
    it("should render interface files with barrel", () => {
      const files = registry.renderFeatureLayer("interface", sampleFeature);
      expect(files.length).toBe(4); // i-*.mts (3) + index.mts
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/features/work-orders/interfaces/i-work-order.mts");
      expect(paths).toContain("src/features/work-orders/interfaces/i-create-work-order.mts");
      expect(paths).toContain("src/features/work-orders/interfaces/i-update-work-order.mts");
      expect(paths).toContain("src/features/work-orders/interfaces/index.mts");
    });
  });

  describe("renderFeatureLayer - schema", () => {
    it("should render validation schema files with barrel", () => {
      const files = registry.renderFeatureLayer("schema", sampleFeature);
      expect(files.length).toBe(2); // validation + index
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/features/work-orders/validation/work-order.validation.mts");
      expect(paths).toContain("src/features/work-orders/validation/index.mts");
    });
  });

  describe("renderFeatureLayer - repository", () => {
    it("should render repository files with barrel", () => {
      const files = registry.renderFeatureLayer("repository", sampleFeature);
      expect(files.length).toBe(2); // repository + index
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/features/work-orders/repository/work-order-repository.mts");
      expect(paths).toContain("src/features/work-orders/repository/index.mts");
    });
  });

  describe("renderFeatureLayer - service", () => {
    it("should render service files with interface and barrel", () => {
      const files = registry.renderFeatureLayer("service", sampleFeature);
      expect(files.length).toBe(3); // service + interface + index
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/features/work-orders/service/work-order-service.mts");
      expect(paths).toContain("src/features/work-orders/service/i-work-order-service.mts");
      expect(paths).toContain("src/features/work-orders/service/index.mts");
    });
  });

  describe("renderFeatureLayer - router", () => {
    it("should render router files with barrel", () => {
      const files = registry.renderFeatureLayer("router", sampleFeature);
      expect(files.length).toBe(2); // router + index
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/features/work-orders/router/work-orders-router.mts");
      expect(paths).toContain("src/features/work-orders/router/index.mts");
    });
  });

  describe("renderFeatureLayer - swagger", () => {
    it("should render swagger detail file", () => {
      const files = registry.renderFeatureLayer("swagger", sampleFeature);
      expect(files.length).toBe(1);
      expect(files[0]?.path).toBe("src/features/work-orders/docs/work-order-swagger.mts");
    });
  });

  describe("renderFeatureLayer - test", () => {
    it("should render service test file", () => {
      const files = registry.renderFeatureLayer("test", sampleFeature);
      expect(files.length).toBe(1);
      expect(files[0]?.path).toBe("tests/work-orders/work-order-service.test.mts");
    });
  });

  describe("renderFeatureLayer - integration-test", () => {
    it("should render integration test file", () => {
      const files = registry.renderFeatureLayer("integration-test", sampleFeature, 4200);
      expect(files.length).toBe(1);
      expect(files[0]?.path).toBe("tests/__tests__/work-order.integration.test.mts");
      expect(files[0]?.content).toContain("4200");
    });
  });

  describe("renderInfrastructure", () => {
    it("should render all infrastructure files", () => {
      const files = registry.renderInfrastructure("my-project", [sampleFeature]);
      expect(files.length).toBe(14);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/env.mts");
      expect(paths).toContain("src/index.mts");
      expect(paths).toContain("src/ioc/get-container.mts");
      expect(paths).toContain("src/ioc/create-database-configuration.mts");
      expect(paths).toContain("src/loggers/logger.mts");
      expect(paths).toContain("src/api/plugins/trace.plugin.mts");
      expect(paths).toContain("package.json");
      expect(paths).toContain("tsconfig.json");
      expect(paths).toContain("docker-compose.yml");
      expect(paths).toContain(".env.example");
      expect(paths).toContain(".gitignore");
      expect(paths).toContain("eslint.config.mjs");
    });
  });

  describe("total file count for single feature", () => {
    it("should generate expected number of files per layer", () => {
      const layers = ["interface", "schema", "repository", "service", "router", "swagger", "test", "integration-test"] as const;
      let totalFiles = 0;
      for (const layer of layers) {
        const files = registry.renderFeatureLayer(layer, sampleFeature);
        totalFiles += files.length;
      }
      // 4 + 2 + 2 + 3 + 2 + 1 + 1 + 1 = 16 feature files
      expect(totalFiles).toBe(16);
    });
  });
});
