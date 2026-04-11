import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/azure-terraform/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "work-orders",
  domain: "work-orders",
  description: "Work order management",
  entities: [{
    name: "work-order",
    pluralName: "work-orders",
    fields: [{ name: "title", type: "string", required: true }],
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

describe("Azure Terraform Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("azure-terraform");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description", () => {
      expect(template.description.length).toBeGreaterThan(0);
    });
  });

  describe("plan", () => {
    it("should plan 4 terraform files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(4);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("infra/main.tf");
      expect(paths).toContain("infra/variables.tf");
      expect(paths).toContain("infra/outputs.tf");
      expect(paths).toContain("infra/providers.tf");
    });

    it("should have descriptions for all planned files", () => {
      const files = template.plan(sampleFeature);
      for (const file of files) {
        expect(file.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe("render", () => {
    it("should render 4 terraform files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(4);
    });

    it("should render main.tf with required Azure resources", () => {
      const files = template.render(sampleFeature, sampleContext);
      const mainTf = files.find((f) => f.path === "infra/main.tf");
      expect(mainTf).toBeDefined();
      expect(mainTf?.content).toContain("azurerm_resource_group");
      expect(mainTf?.content).toContain("azurerm_service_plan");
      expect(mainTf?.content).toContain("azurerm_linux_web_app");
      expect(mainTf?.content).toContain("azurerm_key_vault");
    });

    it("should render main.tf with managed identity", () => {
      const files = template.render(sampleFeature, sampleContext);
      const mainTf = files.find((f) => f.path === "infra/main.tf");
      expect(mainTf?.content).toContain("SystemAssigned");
    });

    it("should render main.tf with queue consumer resources", () => {
      const files = template.render(sampleFeature, sampleContext);
      const mainTf = files.find((f) => f.path === "infra/main.tf");
      expect(mainTf?.content).toContain("azurerm_storage_queue");
      expect(mainTf?.content).toContain("azurerm_linux_function_app");
      expect(mainTf?.content).toContain("queue_consumer");
    });

    it("should render main.tf with timer job resources", () => {
      const files = template.render(sampleFeature, sampleContext);
      const mainTf = files.find((f) => f.path === "infra/main.tf");
      expect(mainTf?.content).toContain("timer_job");
      expect(mainTf?.content).toContain("TIMER_SCHEDULE");
    });

    it("should render variables.tf with project name, environment, location", () => {
      const files = template.render(sampleFeature, sampleContext);
      const variablesTf = files.find((f) => f.path === "infra/variables.tf");
      expect(variablesTf?.content).toContain("project_name");
      expect(variablesTf?.content).toContain("environment");
      expect(variablesTf?.content).toContain("location");
    });

    it("should render outputs.tf with web app URL and KeyVault URI", () => {
      const files = template.render(sampleFeature, sampleContext);
      const outputsTf = files.find((f) => f.path === "infra/outputs.tf");
      expect(outputsTf?.content).toContain("web_app_url");
      expect(outputsTf?.content).toContain("key_vault_uri");
    });

    it("should render providers.tf with AzureRM provider", () => {
      const files = template.render(sampleFeature, sampleContext);
      const providersTf = files.find((f) => f.path === "infra/providers.tf");
      expect(providersTf?.content).toContain("azurerm");
      expect(providersTf?.content).toContain("hashicorp/azurerm");
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

    it("should reject empty file content", () => {
      const files = [
        { path: "infra/main.tf", content: "" },
        { path: "infra/variables.tf", content: "content" },
        { path: "infra/outputs.tf", content: "content" },
        { path: "infra/providers.tf", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("File is empty: infra/main.tf");
    });
  });
});
