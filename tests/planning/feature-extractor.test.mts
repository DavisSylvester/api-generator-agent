import { describe, it, expect } from "bun:test";
import {
  extractFeatures,
  inferRelationships,
  deduplicateFeatures,
} from "../../src/planning/feature-extractor.mts";
import type { ParsedInput } from "../../src/planning/feature-extractor.mts";
import type { IFeatureSpec } from "../../src/core/interfaces/index.mts";

function makeFeature(overrides: Partial<IFeatureSpec> = {}): IFeatureSpec {
  return {
    name: "WorkOrder",
    domain: "work-order",
    description: "Work order management",
    entities: [
      {
        name: "WorkOrder",
        pluralName: "WorkOrders",
        fields: [
          { name: "title", type: "string", required: true, description: "Title" },
          { name: "status", type: "string", required: true, description: "Status" },
        ],
        relationships: [],
        operations: ["create", "read", "update", "delete", "list"],
      },
    ],
    dependsOn: [],
    ...overrides,
  };
}

describe("extractFeatures", () => {
  it("should normalize feature domains to kebab-case", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [makeFeature({ domain: "WorkOrder" })],
    };

    const result = extractFeatures(input);
    expect(result.features[0]?.domain).toBe("work-order");
  });

  it("should collect entity names from all features", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [
        makeFeature({ name: "WorkOrder" }),
        makeFeature({
          name: "User",
          entities: [
            {
              name: "User",
              pluralName: "Users",
              fields: [
                { name: "email", type: "string", required: true, description: "Email" },
              ],
              relationships: [],
              operations: ["create", "read", "update", "delete", "list"],
            },
          ],
        }),
      ],
    };

    const result = extractFeatures(input);
    expect(result.entityNames).toContain("WorkOrder");
    expect(result.entityNames).toContain("User");
  });

  it("should ensure base fields (id, createdAt, updatedAt) are added", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [makeFeature()],
    };

    const result = extractFeatures(input);
    const entity = result.features[0]?.entities[0];
    const fieldNames = entity?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("createdAt");
    expect(fieldNames).toContain("updatedAt");
  });

  it("should not duplicate base fields if already present", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [
        makeFeature({
          entities: [
            {
              name: "Item",
              pluralName: "Items",
              fields: [
                { name: "id", type: "string", required: true, description: "ID" },
                { name: "createdAt", type: "datetime", required: true, description: "Created" },
                { name: "updatedAt", type: "datetime", required: true, description: "Updated" },
              ],
              relationships: [],
              operations: ["create", "read"],
            },
          ],
        }),
      ],
    };

    const result = extractFeatures(input);
    const entity = result.features[0]?.entities[0];
    const idFields = entity?.fields.filter((f) => f.name === "id") ?? [];
    expect(idFields).toHaveLength(1);
  });

  it("should build relationship map from entity relationships", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [
        makeFeature({
          entities: [
            {
              name: "Task",
              pluralName: "Tasks",
              fields: [],
              relationships: [
                {
                  targetEntity: "Project",
                  type: "one-to-many",
                  foreignKey: "projectId",
                  required: true,
                },
              ],
              operations: ["create", "read"],
            },
          ],
        }),
      ],
    };

    const result = extractFeatures(input);
    expect(result.relationshipMap.get("Task")).toContain("Project");
  });

  it("should deduplicate dependsOn entries", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [
        makeFeature({ dependsOn: ["User", "User", "Project"] }),
      ],
    };

    const result = extractFeatures(input);
    const deps = result.features[0]?.dependsOn ?? [];
    expect(deps).toHaveLength(2);
    expect(deps).toContain("User");
    expect(deps).toContain("Project");
  });

  it("should default operations when empty", () => {
    const input: ParsedInput = {
      projectName: "test",
      features: [
        makeFeature({
          entities: [
            {
              name: "Thing",
              pluralName: "Things",
              fields: [],
              relationships: [],
              operations: [],
            },
          ],
        }),
      ],
    };

    const result = extractFeatures(input);
    const ops = result.features[0]?.entities[0]?.operations ?? [];
    expect(ops).toContain("create");
    expect(ops).toContain("read");
    expect(ops).toContain("list");
  });
});

describe("inferRelationships", () => {
  it("should infer relationships from field names ending in Id", () => {
    const features: IFeatureSpec[] = [
      makeFeature({
        name: "Task",
        entities: [
          {
            name: "Task",
            pluralName: "Tasks",
            fields: [
              { name: "projectId", type: "string", required: true, description: "Project ref" },
            ],
            relationships: [],
            operations: ["create", "read"],
          },
        ],
      }),
      makeFeature({
        name: "Project",
        entities: [
          {
            name: "Project",
            pluralName: "Projects",
            fields: [],
            relationships: [],
            operations: ["create", "read"],
          },
        ],
      }),
    ];

    const result = inferRelationships(features);
    const taskRelationships = result[0]?.entities[0]?.relationships ?? [];
    expect(taskRelationships.length).toBeGreaterThanOrEqual(1);
    expect(taskRelationships[0]?.targetEntity).toBe("Project");
  });

  it("should not add duplicate relationships", () => {
    const features: IFeatureSpec[] = [
      makeFeature({
        name: "Task",
        entities: [
          {
            name: "Task",
            pluralName: "Tasks",
            fields: [
              { name: "projectId", type: "string", required: true, description: "Project ref" },
            ],
            relationships: [
              {
                targetEntity: "Project",
                type: "one-to-many",
                foreignKey: "projectId",
                required: true,
              },
            ],
            operations: ["create", "read"],
          },
        ],
      }),
      makeFeature({
        name: "Project",
        entities: [
          {
            name: "Project",
            pluralName: "Projects",
            fields: [],
            relationships: [],
            operations: ["create", "read"],
          },
        ],
      }),
    ];

    const result = inferRelationships(features);
    const taskRelationships = result[0]?.entities[0]?.relationships ?? [];
    const projectRels = taskRelationships.filter(
      (r) => r.targetEntity === "Project",
    );
    expect(projectRels).toHaveLength(1);
  });
});

describe("deduplicateFeatures", () => {
  it("should merge features with the same name", () => {
    const features: IFeatureSpec[] = [
      makeFeature({
        name: "WorkOrder",
        entities: [
          {
            name: "WorkOrder",
            pluralName: "WorkOrders",
            fields: [
              { name: "title", type: "string", required: true, description: "Title" },
            ],
            relationships: [],
            operations: ["create", "read"],
          },
        ],
      }),
      makeFeature({
        name: "WorkOrder",
        entities: [
          {
            name: "WorkOrder",
            pluralName: "WorkOrders",
            fields: [
              { name: "priority", type: "string", required: true, description: "Priority" },
            ],
            relationships: [],
            operations: ["update", "delete"],
          },
        ],
      }),
    ];

    const result = deduplicateFeatures(features);
    expect(result).toHaveLength(1);

    const entity = result[0]?.entities[0];
    const fieldNames = entity?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("priority");
  });

  it("should preserve unique features", () => {
    const features: IFeatureSpec[] = [
      makeFeature({ name: "WorkOrder" }),
      makeFeature({ name: "User" }),
    ];

    const result = deduplicateFeatures(features);
    expect(result).toHaveLength(2);
  });
});
