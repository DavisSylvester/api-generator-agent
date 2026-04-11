import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/queue-consumer/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "messaging",
  domain: "messaging",
  description: "Message processing",
  entities: [{
    name: "message",
    pluralName: "messages",
    fields: [{ name: "content", type: "string", required: true }],
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

describe("Queue Consumer Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("queue-consumer");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description", () => {
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.description).toContain("queue");
    });
  });

  describe("plan", () => {
    it("should plan 4 queue consumer files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(4);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/queue/interfaces/i-message-handler.mts");
      expect(paths).toContain("src/queue/service/queue-listener-service.mts");
      expect(paths).toContain("src/queue/service/i-dead-letter-service.mts");
      expect(paths).toContain("src/queue/service/retry-handler.mts");
    });
  });

  describe("render", () => {
    it("should render 4 queue consumer files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(4);
    });

    it("should render message handler interface with required types", () => {
      const files = template.render(sampleFeature, sampleContext);
      const handler = files.find((f) => f.path.includes("i-message-handler"));
      expect(handler).toBeDefined();
      expect(handler?.content).toContain("IQueueMessage");
      expect(handler?.content).toContain("IMessageHandler");
      expect(handler?.content).toContain("IHandlerResult");
      expect(handler?.content).toContain("IMessageMetadata");
    });

    it("should render queue listener with handler registration", () => {
      const files = template.render(sampleFeature, sampleContext);
      const listener = files.find((f) => f.path.includes("queue-listener-service"));
      expect(listener).toBeDefined();
      expect(listener?.content).toContain("registerHandler");
      expect(listener?.content).toContain("processMessage");
    });

    it("should render dead letter service", () => {
      const files = template.render(sampleFeature, sampleContext);
      const dlq = files.find((f) => f.path.includes("i-dead-letter-service"));
      expect(dlq).toBeDefined();
      expect(dlq?.content).toContain("IDeadLetterService");
      expect(dlq?.content).toContain("InMemoryDeadLetterService");
    });

    it("should render retry handler with exponential backoff", () => {
      const files = template.render(sampleFeature, sampleContext);
      const retry = files.find((f) => f.path.includes("retry-handler"));
      expect(retry).toBeDefined();
      expect(retry?.content).toContain("RetryHandler");
      expect(retry?.content).toContain("shouldRetry");
      expect(retry?.content).toContain("getDelay");
      expect(retry?.content).toContain("backoffMultiplier");
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

    it("should reject empty handler interface", () => {
      const files = [
        { path: "src/queue/interfaces/i-message-handler.mts", content: "" },
        { path: "src/queue/service/queue-listener-service.mts", content: "content" },
        { path: "src/queue/service/i-dead-letter-service.mts", content: "content" },
        { path: "src/queue/service/retry-handler.mts", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
    });
  });
});
