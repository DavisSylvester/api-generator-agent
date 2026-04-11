import { describe, it, expect } from "bun:test";
import { renderContainer } from "../../templates/base/container.tmpl.mts";
import { renderServer } from "../../templates/base/server.tmpl.mts";
import { renderEnvConfig, renderDatabaseConfig, renderEnvExample } from "../../templates/base/env-config.tmpl.mts";
import { renderDockerCompose } from "../../templates/base/docker-compose.tmpl.mts";
import { renderTracePlugin } from "../../templates/base/trace-plugin.tmpl.mts";
import { renderLogger } from "../../templates/base/logger.tmpl.mts";
import { renderPackageJson } from "../../templates/base/package-json.tmpl.mts";
import { renderTsconfig } from "../../templates/base/tsconfig.tmpl.mts";
import { renderEslintConfig } from "../../templates/base/eslint-config.tmpl.mts";
import { renderHealthRouter } from "../../templates/base/health-router.tmpl.mts";
import { renderGitignore } from "../../templates/base/gitignore.tmpl.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

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
      ],
      relationships: [],
      operations: ["create", "read", "update", "delete", "list"],
    }],
    dependsOn: [],
  },
];

describe("infrastructure templates", () => {
  describe("renderContainer", () => {
    it("should render getContainer function", () => {
      const output = renderContainer("my-project", sampleFeatures);
      expect(output).toContain("export async function getContainer()");
      expect(output).toContain("IContainer");
    });

    it("should register all feature repositories and services", () => {
      const output = renderContainer("my-project", sampleFeatures);
      expect(output).toContain("WorkOrderRepository");
      expect(output).toContain("WorkOrderService");
      expect(output).toContain("workOrderRepository");
      expect(output).toContain("workOrderService");
    });

    it("should connect to MongoDB", () => {
      const output = renderContainer("my-project", sampleFeatures);
      expect(output).toContain("MongoClient");
      expect(output).toContain("client.connect()");
    });
  });

  describe("renderServer", () => {
    it("should render main server entry point", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain("new Elysia()");
      expect(output).toContain("getContainer()");
    });

    it("should configure swagger at /swagger", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain('openapi({ path: "/swagger", provider: "scalar" })');
    });

    it("should include cors", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain("cors()");
    });

    it("should include health endpoint", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain('"/health"');
    });

    it("should wire feature routers", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain("createWorkOrderRouter");
    });

    it("should log swagger URL", () => {
      const output = renderServer("my-project", sampleFeatures);
      expect(output).toContain("Swagger UI");
    });
  });

  describe("renderEnvConfig", () => {
    it("should render TypeBox env validation", () => {
      const output = renderEnvConfig("my-project");
      expect(output).toContain("import { Type, Static } from \"@sinclair/typebox\"");
      expect(output).toContain("import { Value } from \"@sinclair/typebox/value\"");
      expect(output).toContain("envSchema");
      expect(output).toContain("loadEnv");
      expect(output).toContain("Bun.env");
    });

    it("should use Value.Check for validation", () => {
      const output = renderEnvConfig("my-project");
      expect(output).toContain("Value.Check(envSchema,");
      expect(output).toContain("Value.Default(envSchema,");
      expect(output).toContain("Value.Errors(envSchema,");
    });

    it("should include PORT, MONGODB_URI, NODE_ENV, JWT_SECRET", () => {
      const output = renderEnvConfig("my-project");
      expect(output).toContain("PORT");
      expect(output).toContain("MONGODB_URI");
      expect(output).toContain("NODE_ENV");
      expect(output).toContain("JWT_SECRET");
    });

    it("should NOT contain any Zod references", () => {
      const output = renderEnvConfig("my-project");
      expect(output).not.toContain("from \"zod\"");
      expect(output).not.toContain("z.object");
      expect(output).not.toContain("z.coerce");
      expect(output).not.toContain("safeParse");
    });
  });

  describe("renderDatabaseConfig", () => {
    it("should render database configuration", () => {
      const output = renderDatabaseConfig();
      expect(output).toContain("DatabaseConfig");
      expect(output).toContain("createDatabaseConfiguration");
      expect(output).toContain("uri");
      expect(output).toContain("dbName");
    });
  });

  describe("renderDockerCompose", () => {
    it("should render docker-compose with MongoDB", () => {
      const output = renderDockerCompose("my-project");
      expect(output).toContain("mongo:7");
      expect(output).toContain("27017:27017");
      expect(output).toContain("my-project");
    });
  });

  describe("renderTracePlugin", () => {
    it("should render trace plugin with ULID", () => {
      const output = renderTracePlugin();
      expect(output).toContain("ulid()");
      expect(output).toContain("traceId");
      expect(output).toContain("onRequest");
      expect(output).toContain("onAfterHandle");
      expect(output).toContain("onError");
    });
  });

  describe("renderLogger", () => {
    it("should render Winston logger factory", () => {
      const output = renderLogger("my-project");
      expect(output).toContain("winston.createLogger");
      expect(output).toContain("createLogger");
      expect(output).toContain("my-project");
    });
  });

  describe("renderPackageJson", () => {
    it("should render scoped package.json with TypeBox instead of Zod", () => {
      const output = renderPackageJson("my-project");
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe("@my-project/api");
      expect(parsed.type).toBe("module");
      expect(parsed.dependencies.elysia).toBeDefined();
      expect(parsed.dependencies["@sinclair/typebox"]).toBeDefined();
      expect(parsed.dependencies.mongodb).toBeDefined();
      expect(parsed.dependencies.ulid).toBeDefined();
      expect(parsed.dependencies.winston).toBeDefined();
    });

    it("should NOT include zod as a dependency", () => {
      const output = renderPackageJson("my-project");
      const parsed = JSON.parse(output);
      expect(parsed.dependencies.zod).toBeUndefined();
    });
  });

  describe("renderTsconfig", () => {
    it("should render strict tsconfig with path aliases", () => {
      const output = renderTsconfig("my-project");
      const parsed = JSON.parse(output);
      expect(parsed.compilerOptions.strict).toBe(true);
      expect(parsed.compilerOptions.noEmit).toBe(true);
      expect(parsed.compilerOptions.paths["@my-project/shared"]).toBeDefined();
    });
  });

  describe("renderEslintConfig", () => {
    it("should render ESLint flat config with strict rules", () => {
      const output = renderEslintConfig();
      expect(output).toContain("no-explicit-any");
      expect(output).toContain("explicit-function-return-type");
      expect(output).toContain("quotes");
      expect(output).toContain("double");
    });
  });

  describe("renderHealthRouter", () => {
    it("should render health router", () => {
      const output = renderHealthRouter();
      expect(output).toContain('"/health"');
      expect(output).toContain("status");
      expect(output).toContain("ok");
    });
  });

  describe("renderGitignore", () => {
    it("should include common entries", () => {
      const output = renderGitignore();
      expect(output).toContain("node_modules");
      expect(output).toContain(".env");
      expect(output).toContain(".docs/");
    });
  });
});
