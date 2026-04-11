import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/external-api-client/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "integrations",
  domain: "integrations",
  description: "External API integrations",
  entities: [{
    name: "integration",
    pluralName: "integrations",
    fields: [{ name: "endpoint", type: "string", required: true }],
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

describe("External API Client Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("external-api-client");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description", () => {
      expect(template.description.length).toBeGreaterThan(0);
    });
  });

  describe("plan", () => {
    it("should plan 3 client files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(3);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/clients/interfaces/i-api-client.mts");
      expect(paths).toContain("src/clients/service/http-api-client.mts");
      expect(paths).toContain("src/clients/service/response-mapper.mts");
    });
  });

  describe("render", () => {
    it("should render 3 client files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(3);
    });

    it("should render API client interface with all HTTP methods", () => {
      const files = template.render(sampleFeature, sampleContext);
      const iface = files.find((f) => f.path.includes("i-api-client"));
      expect(iface).toBeDefined();
      expect(iface?.content).toContain("IApiClient");
      expect(iface?.content).toContain("IApiResponse");
      expect(iface?.content).toContain("IApiClientConfig");
      expect(iface?.content).toContain("get<T>");
      expect(iface?.content).toContain("post<T");
      expect(iface?.content).toContain("put<T");
      expect(iface?.content).toContain("patch<T");
      expect(iface?.content).toContain("delete<T>");
    });

    it("should render HTTP client with retry logic", () => {
      const files = template.render(sampleFeature, sampleContext);
      const client = files.find((f) => f.path.includes("http-api-client"));
      expect(client).toBeDefined();
      expect(client?.content).toContain("HttpApiClient");
      expect(client?.content).toContain("retryAttempts");
      expect(client?.content).toContain("isRetryable");
    });

    it("should render HTTP client with timeout support", () => {
      const files = template.render(sampleFeature, sampleContext);
      const client = files.find((f) => f.path.includes("http-api-client"));
      expect(client?.content).toContain("timeoutMs");
      expect(client?.content).toContain("AbortController");
    });

    it("should render response mapper with map and mapArray", () => {
      const files = template.render(sampleFeature, sampleContext);
      const mapper = files.find((f) => f.path.includes("response-mapper"));
      expect(mapper).toBeDefined();
      expect(mapper?.content).toContain("IResponseMapper");
      expect(mapper?.content).toContain("DefaultResponseMapper");
      expect(mapper?.content).toContain("map(");
      expect(mapper?.content).toContain("mapArray(");
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

    it("should detect missing required types in client interface", () => {
      const files = [
        { path: "src/clients/interfaces/i-api-client.mts", content: "export interface IFoo {}" },
        { path: "src/clients/service/http-api-client.mts", content: "content" },
        { path: "src/clients/service/response-mapper.mts", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("IApiClient"))).toBe(true);
    });
  });
});
