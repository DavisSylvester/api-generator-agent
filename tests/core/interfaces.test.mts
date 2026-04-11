import { describe, it, expect } from "bun:test";
import type {
  IFeatureSpec,
  IEntitySpec,
  IFieldSpec,
  IRelationship,
  IGenerationPlan,
  IGenerationStep,
  ITemplate,
  IGeneratedFile,
  IRenderedFile,
  IValidationResult,
  IGenerationContext,
  ITraceEntry,
  IToolUse,
  ITraceError,
  IVerificationResult,
} from "../../src/core/interfaces/index.mts";

describe("Core Interfaces", () => {
  it("should allow IFieldSpec creation", () => {
    const field: IFieldSpec = {
      name: "title",
      type: "string",
      required: true,
      description: "Title field",
    };
    expect(field.name).toBe("title");
    expect(field.required).toBe(true);
  });

  it("should allow IEntitySpec creation", () => {
    const entity: IEntitySpec = {
      name: "work-order",
      pluralName: "work-orders",
      fields: [{ name: "title", type: "string", required: true }],
      relationships: [],
      operations: ["create", "read", "update", "delete"],
    };
    expect(entity.name).toBe("work-order");
    expect(entity.operations).toContain("create");
  });

  it("should allow IFeatureSpec creation", () => {
    const feature: IFeatureSpec = {
      name: "work-orders",
      domain: "work-orders",
      description: "Work order management",
      entities: [],
      dependsOn: [],
    };
    expect(feature.name).toBe("work-orders");
    expect(feature.domain).toBe("work-orders");
  });

  it("should allow IRelationship creation", () => {
    const rel: IRelationship = {
      targetEntity: "user",
      type: "one-to-many",
      foreignKey: "userId",
      required: true,
    };
    expect(rel.targetEntity).toBe("user");
    expect(rel.type).toBe("one-to-many");
  });

  it("should allow IGenerationPlan creation", () => {
    const plan: IGenerationPlan = {
      projectName: "test-project",
      features: [],
      steps: [],
      createdAt: new Date().toISOString(),
    };
    expect(plan.projectName).toBe("test-project");
  });

  it("should allow ITraceEntry creation", () => {
    const entry: ITraceEntry = {
      traceId: "trace-001",
      sessionId: "session-001",
      featureName: "work-orders",
      stepName: "render-interface",
      iteration: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 100,
      status: "success",
      toolUses: [],
      tokenConsumption: { prompt: 0, completion: 0, total: 0 },
      result: {
        filesGenerated: [],
        filesModified: [],
        linesOfCode: 0,
        summary: "test",
      },
      errors: [],
      documentation: "",
    };
    expect(entry.traceId).toBe("trace-001");
    expect(entry.status).toBe("success");
  });

  it("should allow IVerificationResult creation", () => {
    const result: IVerificationResult = {
      passed: true,
      gate: "eslint",
      errors: [],
      warnings: [],
      durationMs: 50,
    };
    expect(result.passed).toBe(true);
    expect(result.gate).toBe("eslint");
  });
});
