import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/teams-notification/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "notifications",
  domain: "notifications",
  description: "Notification handling",
  entities: [{
    name: "notification",
    pluralName: "notifications",
    fields: [{ name: "message", type: "string", required: true }],
    relationships: [],
    operations: ["create", "read"],
  }],
  dependsOn: [],
};

const sampleContext: IGenerationContext = {
  projectName: "my-api",
  outputDir: "/output",
  existingFiles: new Map(),
};

describe("Teams Notification Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("teams-notification");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description mentioning Teams", () => {
      expect(template.description).toContain("Teams");
    });
  });

  describe("plan", () => {
    it("should plan 3 notification files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(3);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/notifications/service/message-builder.mts");
      expect(paths).toContain("src/notifications/service/webhook-client.mts");
      expect(paths).toContain("src/notifications/service/notification-templates.mts");
    });
  });

  describe("render", () => {
    it("should render 3 notification files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(3);
    });

    it("should render message builder with fluent API", () => {
      const files = template.render(sampleFeature, sampleContext);
      const builder = files.find((f) => f.path.includes("message-builder"));
      expect(builder).toBeDefined();
      expect(builder?.content).toContain("TeamsMessageBuilder");
      expect(builder?.content).toContain("ITeamsMessageCard");
      expect(builder?.content).toContain("ITeamsSection");
      expect(builder?.content).toContain("setColor");
      expect(builder?.content).toContain("setSummary");
      expect(builder?.content).toContain("addSection");
      expect(builder?.content).toContain("build()");
    });

    it("should render message builder with theme colors", () => {
      const files = template.render(sampleFeature, sampleContext);
      const builder = files.find((f) => f.path.includes("message-builder"));
      expect(builder?.content).toContain("THEME_COLORS");
      expect(builder?.content).toContain("SUCCESS");
      expect(builder?.content).toContain("ERROR");
      expect(builder?.content).toContain("WARNING");
    });

    it("should render webhook client with retry logic", () => {
      const files = template.render(sampleFeature, sampleContext);
      const client = files.find((f) => f.path.includes("webhook-client"));
      expect(client).toBeDefined();
      expect(client?.content).toContain("TeamsWebhookClient");
      expect(client?.content).toContain("retryAttempts");
      expect(client?.content).toContain("webhookUrl");
    });

    it("should render notification templates with pre-built messages", () => {
      const files = template.render(sampleFeature, sampleContext);
      const templates = files.find((f) => f.path.includes("notification-templates"));
      expect(templates).toBeDefined();
      expect(templates?.content).toContain("buildDeployNotification");
      expect(templates?.content).toContain("buildErrorNotification");
      expect(templates?.content).toContain("buildHealthCheckNotification");
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

    it("should detect missing required types in message builder", () => {
      const files = [
        { path: "src/notifications/service/message-builder.mts", content: "export class Foo {}" },
        { path: "src/notifications/service/webhook-client.mts", content: "content" },
        { path: "src/notifications/service/notification-templates.mts", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("ITeamsMessageCard"))).toBe(true);
    });
  });
});
