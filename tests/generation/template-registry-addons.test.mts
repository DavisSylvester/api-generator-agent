import { describe, it, expect } from "bun:test";
import { TemplateRegistry } from "../../src/generation/template-registry.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { ITemplate, IFeatureSpec } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "test-feature",
  domain: "test",
  description: "Test feature",
  entities: [{
    name: "test-entity",
    pluralName: "test-entities",
    fields: [{ name: "title", type: "string", required: true }],
    relationships: [],
    operations: ["create", "read", "update", "delete"],
  }],
  dependsOn: [],
};

function createMockAddon(name: string): ITemplate {
  return {
    name,
    type: TEMPLATE_TYPE.ADDON,
    description: `Mock addon: ${name}`,
    plan: () => [{ path: `${name}/output.mts`, description: `${name} output` }],
    render: () => [{ path: `${name}/output.mts`, content: `// ${name} content` }],
    validate: () => ({ valid: true, errors: [] }),
  };
}

describe("TemplateRegistry - Addon Management", () => {
  describe("registerAddon", () => {
    it("should register an addon template", () => {
      const registry = new TemplateRegistry();
      const addon = createMockAddon("test-addon");
      registry.registerAddon(addon);
      expect(registry.hasAddon("test-addon")).toBe(true);
    });

    it("should allow registering multiple addons", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("addon-a"));
      registry.registerAddon(createMockAddon("addon-b"));
      registry.registerAddon(createMockAddon("addon-c"));
      expect(registry.getRegisteredAddons()).toHaveLength(3);
    });

    it("should overwrite addon with the same name", () => {
      const registry = new TemplateRegistry();
      const original = createMockAddon("test-addon");
      const replacement = {
        ...createMockAddon("test-addon"),
        description: "Replaced addon",
      };
      registry.registerAddon(original);
      registry.registerAddon(replacement);
      expect(registry.getRegisteredAddons()).toHaveLength(1);
      expect(registry.getAddon("test-addon")?.description).toBe("Replaced addon");
    });
  });

  describe("unregisterAddon", () => {
    it("should remove a registered addon", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("test-addon"));
      expect(registry.unregisterAddon("test-addon")).toBe(true);
      expect(registry.hasAddon("test-addon")).toBe(false);
    });

    it("should return false when unregistering non-existent addon", () => {
      const registry = new TemplateRegistry();
      expect(registry.unregisterAddon("nonexistent")).toBe(false);
    });
  });

  describe("getAddon", () => {
    it("should return the addon by name", () => {
      const registry = new TemplateRegistry();
      const addon = createMockAddon("my-addon");
      registry.registerAddon(addon);
      const retrieved = registry.getAddon("my-addon");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("my-addon");
    });

    it("should return undefined for non-existent addon", () => {
      const registry = new TemplateRegistry();
      expect(registry.getAddon("nonexistent")).toBeUndefined();
    });
  });

  describe("getRegisteredAddons", () => {
    it("should return empty array when no addons registered", () => {
      const registry = new TemplateRegistry();
      expect(registry.getRegisteredAddons()).toHaveLength(0);
    });

    it("should return all registered addons", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("a"));
      registry.registerAddon(createMockAddon("b"));
      const addons = registry.getRegisteredAddons();
      expect(addons).toHaveLength(2);
      const names = addons.map((a) => a.name);
      expect(names).toContain("a");
      expect(names).toContain("b");
    });
  });

  describe("hasAddon", () => {
    it("should return true for registered addon", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("exists"));
      expect(registry.hasAddon("exists")).toBe(true);
    });

    it("should return false for unregistered addon", () => {
      const registry = new TemplateRegistry();
      expect(registry.hasAddon("nope")).toBe(false);
    });
  });

  describe("renderAddon", () => {
    it("should render files from a registered addon", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("render-test"));
      const context = {
        projectName: "test-project",
        outputDir: "/output",
        existingFiles: new Map<string, string>(),
      };
      const files = registry.renderAddon("render-test", sampleFeature, context);
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("render-test/output.mts");
      expect(files[0]?.content).toContain("render-test");
    });

    it("should throw when rendering non-existent addon", () => {
      const registry = new TemplateRegistry();
      const context = {
        projectName: "test",
        outputDir: "/output",
        existingFiles: new Map<string, string>(),
      };
      expect(() => registry.renderAddon("nonexistent", sampleFeature, context)).toThrow(
        "Addon template not found: nonexistent",
      );
    });
  });

  describe("existing feature layer rendering still works", () => {
    it("should not affect base template rendering", () => {
      const registry = new TemplateRegistry();
      registry.registerAddon(createMockAddon("some-addon"));
      const files = registry.renderFeatureLayer("interface", sampleFeature);
      expect(files.length).toBe(4);
    });
  });
});
