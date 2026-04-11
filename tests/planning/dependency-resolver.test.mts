import { describe, it, expect } from "bun:test";
import {
  resolveDependencies,
  wireDependencies,
} from "../../src/planning/dependency-resolver.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

function makeFeature(
  name: string,
  dependsOn: string[] = [],
  relationships: Array<{ targetEntity: string }> = [],
): IFeatureSpec {
  return {
    name,
    domain: name.toLowerCase(),
    description: `${name} feature`,
    entities: [
      {
        name,
        pluralName: `${name}s`,
        fields: [],
        relationships: relationships.map((r) => ({
          targetEntity: r.targetEntity,
          type: "one-to-many" as const,
          foreignKey: `${r.targetEntity.toLowerCase()}Id`,
          required: true,
        })),
        operations: ["create", "read", "update", "delete", "list"],
      },
    ],
    dependsOn,
  };
}

describe("resolveDependencies", () => {
  it("should order independent features alphabetically", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Zebra"),
      makeFeature("Alpha"),
      makeFeature("Middle"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.ordered.map((f) => f.name);
      expect(names).toEqual(["Alpha", "Middle", "Zebra"]);
    }
  });

  it("should place dependencies before dependents", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", ["Project"]),
      makeFeature("Project"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.ordered.map((f) => f.name);
      expect(names.indexOf("Project")).toBeLessThan(names.indexOf("Task"));
    }
  });

  it("should handle multi-level dependencies", () => {
    const features: IFeatureSpec[] = [
      makeFeature("SubTask", ["Task"]),
      makeFeature("Task", ["Project"]),
      makeFeature("Project"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.ordered.map((f) => f.name);
      expect(names.indexOf("Project")).toBeLessThan(names.indexOf("Task"));
      expect(names.indexOf("Task")).toBeLessThan(names.indexOf("SubTask"));
    }
  });

  it("should detect cycles and return error", () => {
    const features: IFeatureSpec[] = [
      makeFeature("A", ["B"]),
      makeFeature("B", ["A"]),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("cycle");
    }
  });

  it("should detect missing dependency targets", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", ["NonExistent"]),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("NonExistent");
    }
  });

  it("should group independent features into layers", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", ["Project"]),
      makeFeature("Comment", ["Task"]),
      makeFeature("Project"),
      makeFeature("User"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { layers } = result.value;
      // Layer 0: Project, User (no deps)
      // Layer 1: Task (depends on Project)
      // Layer 2: Comment (depends on Task)
      expect(layers).toHaveLength(3);

      const layer0Names = layers[0]?.map((f) => f.name) ?? [];
      expect(layer0Names).toContain("Project");
      expect(layer0Names).toContain("User");

      const layer1Names = layers[1]?.map((f) => f.name) ?? [];
      expect(layer1Names).toContain("Task");

      const layer2Names = layers[2]?.map((f) => f.name) ?? [];
      expect(layer2Names).toContain("Comment");
    }
  });

  it("should handle a single feature with no dependencies", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Simple"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ordered).toHaveLength(1);
      expect(result.value.ordered[0]?.name).toBe("Simple");
      expect(result.value.layers).toHaveLength(1);
    }
  });

  it("should handle empty feature list", () => {
    const result = resolveDependencies([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ordered).toHaveLength(0);
      expect(result.value.layers).toHaveLength(0);
    }
  });

  it("should handle diamond dependencies", () => {
    // A depends on B and C, both B and C depend on D
    const features: IFeatureSpec[] = [
      makeFeature("A", ["B", "C"]),
      makeFeature("B", ["D"]),
      makeFeature("C", ["D"]),
      makeFeature("D"),
    ];

    const result = resolveDependencies(features);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.value.ordered.map((f) => f.name);
      expect(names.indexOf("D")).toBeLessThan(names.indexOf("B"));
      expect(names.indexOf("D")).toBeLessThan(names.indexOf("C"));
      expect(names.indexOf("B")).toBeLessThan(names.indexOf("A"));
      expect(names.indexOf("C")).toBeLessThan(names.indexOf("A"));
    }
  });
});

describe("wireDependencies", () => {
  it("should wire dependencies from entity relationships", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", [], [{ targetEntity: "Project" }]),
      makeFeature("Project"),
    ];

    const wired = wireDependencies(features);
    const taskFeature = wired.find((f) => f.name === "Task");
    expect(taskFeature?.dependsOn).toContain("Project");
  });

  it("should not add self-dependency", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", [], [{ targetEntity: "Task" }]),
    ];

    const wired = wireDependencies(features);
    const taskFeature = wired.find((f) => f.name === "Task");
    expect(taskFeature?.dependsOn).not.toContain("Task");
  });

  it("should preserve explicit dependencies", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", ["Auth"], [{ targetEntity: "Project" }]),
      makeFeature("Project"),
      makeFeature("Auth"),
    ];

    const wired = wireDependencies(features);
    const taskFeature = wired.find((f) => f.name === "Task");
    expect(taskFeature?.dependsOn).toContain("Auth");
    expect(taskFeature?.dependsOn).toContain("Project");
  });

  it("should not add duplicate dependencies", () => {
    const features: IFeatureSpec[] = [
      makeFeature("Task", ["Project"], [{ targetEntity: "Project" }]),
      makeFeature("Project"),
    ];

    const wired = wireDependencies(features);
    const taskFeature = wired.find((f) => f.name === "Task");
    const projectDeps = taskFeature?.dependsOn.filter((d) => d === "Project") ?? [];
    expect(projectDeps).toHaveLength(1);
  });
});
