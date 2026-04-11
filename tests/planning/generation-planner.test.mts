import { describe, it, expect } from "bun:test";
import winston from "winston";
import { GenerationPlanner } from "../../src/planning/generation-planner.mts";
import type { ParsedInput } from "../../src/planning/feature-extractor.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

const silentLogger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()],
});

function makeParsedInput(features: IFeatureSpec[]): ParsedInput {
  return {
    projectName: "test-project",
    features,
  };
}

function makeFeature(
  name: string,
  dependsOn: string[] = [],
): IFeatureSpec {
  return {
    name,
    domain: name.toLowerCase(),
    description: `${name} feature`,
    entities: [
      {
        name,
        pluralName: `${name}s`,
        fields: [
          { name: "name", type: "string", required: true, description: "Name" },
        ],
        relationships: [],
        operations: ["create", "read", "update", "delete", "list"],
      },
    ],
    dependsOn,
  };
}

describe("GenerationPlanner", () => {
  describe("createPlan", () => {
    it("should create a plan with ordered features", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([
        makeFeature("Task", ["Project"]),
        makeFeature("Project"),
      ]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const plan = result.value;
        expect(plan.projectName).toBe("test-project");
        expect(plan.features).toHaveLength(2);

        const featureNames = plan.features.map((f) => f.name);
        expect(featureNames.indexOf("Project")).toBeLessThan(
          featureNames.indexOf("Task"),
        );
      }
    });

    it("should generate steps for each feature in layer order", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([makeFeature("Simple")]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const stepNames = result.value.steps.map((s) => s.stepName);
        expect(stepNames).toContain("Simple/interfaces");
        expect(stepNames).toContain("Simple/schemas");
        expect(stepNames).toContain("Simple/repository");
        expect(stepNames).toContain("Simple/service");
        expect(stepNames).toContain("Simple/router");
        expect(stepNames).toContain("Simple/tests");
      }
    });

    it("should order steps within a feature sequentially", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([makeFeature("Thing")]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const steps = result.value.steps;
        for (let i = 1; i < steps.length; i++) {
          const step = steps[i];
          const prevStep = steps[i - 1];
          if (step && prevStep) {
            expect(step.order).toBeGreaterThan(prevStep.order);
          }
        }
      }
    });

    it("should add cross-feature dependencies on first step", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([
        makeFeature("Child", ["Parent"]),
        makeFeature("Parent"),
      ]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const childInterfaceStep = result.value.steps.find(
          (s) => s.stepName === "Child/interfaces",
        );
        expect(childInterfaceStep?.dependsOn).toContain("Parent/tests");
      }
    });

    it("should return error for cyclic dependencies", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([
        makeFeature("A", ["B"]),
        makeFeature("B", ["A"]),
      ]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(false);
    });

    it("should set createdAt timestamp", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([makeFeature("Simple")]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.createdAt).toBeTruthy();
        // Should be a valid ISO date string
        const date = new Date(result.value.createdAt);
        expect(date.getTime()).not.toBeNaN();
      }
    });

    it("should handle empty feature list", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const input = makeParsedInput([]);

      const result = planner.createPlan(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.features).toHaveLength(0);
        expect(result.value.steps).toHaveLength(0);
      }
    });
  });

  describe("createPlanFromOrdered", () => {
    it("should create a plan from pre-ordered features", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const features = [
        makeFeature("Parent"),
        makeFeature("Child", ["Parent"]),
      ];

      const plan = planner.createPlanFromOrdered(features);
      expect(plan.projectName).toBe("test-project");
      expect(plan.features).toHaveLength(2);
      expect(plan.steps.length).toBe(12); // 6 layers * 2 features
    });

    it("should generate correct step count per feature", () => {
      const planner = new GenerationPlanner(silentLogger, {
        projectName: "test-project",
      });

      const plan = planner.createPlanFromOrdered([makeFeature("Solo")]);
      expect(plan.steps).toHaveLength(6);
    });
  });
});
