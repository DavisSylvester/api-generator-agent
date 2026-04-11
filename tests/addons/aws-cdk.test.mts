import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/aws-cdk/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "inventory",
  domain: "inventory",
  description: "Inventory management",
  entities: [{
    name: "item",
    pluralName: "items",
    fields: [{ name: "name", type: "string", required: true }],
    relationships: [],
    operations: ["create", "read", "update", "delete"],
  }],
  dependsOn: [],
};

const sampleContext: IGenerationContext = {
  projectName: "my-api",
  outputDir: "/output",
  existingFiles: new Map(),
};

describe("AWS CDK Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("aws-cdk");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description", () => {
      expect(template.description.length).toBeGreaterThan(0);
    });
  });

  describe("plan", () => {
    it("should plan 3 CDK files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(3);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("infra/cdk/lib/stack.ts");
      expect(paths).toContain("infra/cdk/bin/app.ts");
      expect(paths).toContain("infra/cdk/cdk.json");
    });

    it("should have descriptions for all planned files", () => {
      const files = template.plan(sampleFeature);
      for (const file of files) {
        expect(file.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("render", () => {
    it("should render 3 CDK files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(3);
    });

    it("should render stack.ts with Lambda, API Gateway, DynamoDB, SQS", () => {
      const files = template.render(sampleFeature, sampleContext);
      const stackTs = files.find((f) => f.path === "infra/cdk/lib/stack.ts");
      expect(stackTs).toBeDefined();
      expect(stackTs?.content).toContain("aws-lambda");
      expect(stackTs?.content).toContain("aws-apigateway");
      expect(stackTs?.content).toContain("aws-dynamodb");
      expect(stackTs?.content).toContain("aws-sqs");
    });

    it("should render stack.ts with IAM roles", () => {
      const files = template.render(sampleFeature, sampleContext);
      const stackTs = files.find((f) => f.path === "infra/cdk/lib/stack.ts");
      expect(stackTs?.content).toContain("aws-iam");
      expect(stackTs?.content).toContain("grantReadWriteData");
    });

    it("should render stack.ts with PascalCase class name from project name", () => {
      const files = template.render(sampleFeature, sampleContext);
      const stackTs = files.find((f) => f.path === "infra/cdk/lib/stack.ts");
      expect(stackTs?.content).toContain("MyApiStack");
    });

    it("should render app.ts with CDK app entry", () => {
      const files = template.render(sampleFeature, sampleContext);
      const appTs = files.find((f) => f.path === "infra/cdk/bin/app.ts");
      expect(appTs?.content).toContain("cdk.App");
      expect(appTs?.content).toContain("MyApiStack");
    });

    it("should render cdk.json with correct config", () => {
      const files = template.render(sampleFeature, sampleContext);
      const cdkJson = files.find((f) => f.path === "infra/cdk/cdk.json");
      expect(cdkJson?.content).toContain("ts-node");
      const parsed = JSON.parse(cdkJson?.content ?? "{}");
      expect(parsed.context?.["project:name"]).toBe("my-api");
    });
  });

  describe("validate", () => {
    it("should validate complete render output as valid", () => {
      const files = template.render(sampleFeature, sampleContext);
      const result = template.validate(files);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject missing files", () => {
      const result = template.validate([]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject empty stack.ts", () => {
      const files = [
        { path: "infra/cdk/lib/stack.ts", content: "   " },
        { path: "infra/cdk/bin/app.ts", content: "content" },
        { path: "infra/cdk/cdk.json", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
    });
  });
});
