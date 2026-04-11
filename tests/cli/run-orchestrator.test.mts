import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";
import type { Logger } from "winston";
import {
  parseInput,
  runPlanning,
  formatPlan,
  getRunStatus,
  formatRunStatus,
  getResumableFeatures,
} from "../../src/cli/run-orchestrator.mts";
import type { RunStatus } from "../../src/cli/run-orchestrator.mts";

function createTestLogger(): Logger {
  return winston.createLogger({
    level: "warn",
    transports: [new winston.transports.Console({ silent: true })],
  });
}

const logger = createTestLogger();

describe("parseInput", () => {
  let tmpDir: string;
  let prdPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orchestrator-test-"));
    prdPath = join(tmpDir, "test-prd.md");
    await writeFile(
      prdPath,
      [
        "# Work Orders API",
        "",
        "- [ ] Feature: Work Orders -- CRUD for work orders with status",
        "- [ ] Feature: Technicians -- Technician management with email",
      ].join("\n"),
      "utf-8",
    );
  });

  it("should parse PRD file input", async () => {
    const result = await parseInput(
      { mode: "prd", prdPath, projectName: "work-orders" },
      logger,
    );
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.projectName).toBe("work-orders");
  });

  it("should use parsed project name when none provided", async () => {
    const result = await parseInput(
      { mode: "prd", prdPath, projectName: "" },
      logger,
    );
    // parsePrd extracts project name from heading
    expect(result.projectName).toBeTruthy();
  });

  it("should parse NL prompt input", async () => {
    const result = await parseInput(
      {
        mode: "prompt",
        prompt: "Build a work order management API with status tracking",
        projectName: "work-orders",
      },
      logger,
    );
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.projectName).toBe("work-orders");
  });

  it("should throw when neither prd nor prompt is provided", async () => {
    expect(
      parseInput({ mode: "prd", projectName: "test" }, logger),
    ).rejects.toThrow();
  });

  it("should throw when PRD file does not exist", async () => {
    expect(
      parseInput(
        { mode: "prd", prdPath: "/nonexistent/path.md", projectName: "test" },
        logger,
      ),
    ).rejects.toThrow();
  });
});

describe("runPlanning", () => {
  it("should produce a valid generation plan", () => {
    const features = [
      {
        name: "WorkOrder",
        domain: "work-orders",
        description: "Work order management",
        entities: [
          {
            name: "WorkOrder",
            pluralName: "WorkOrders",
            fields: [
              { name: "title", type: "string", required: true },
              { name: "status", type: "string", required: true },
            ],
            relationships: [],
            operations: ["create", "read", "update", "delete", "list"],
          },
        ],
        dependsOn: [],
      },
    ];

    const result = runPlanning(features, "work-orders-api", logger);

    expect(result.plan).toBeDefined();
    expect(result.plan.projectName).toBe("work-orders-api");
    expect(result.plan.features.length).toBeGreaterThan(0);
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.runId).toBeTruthy();
  });

  it("should order features by dependencies", () => {
    const features = [
      {
        name: "Assignment",
        domain: "assignments",
        description: "Work order assignments",
        entities: [
          {
            name: "Assignment",
            pluralName: "Assignments",
            fields: [
              { name: "workOrderId", type: "string", required: true },
            ],
            relationships: [
              {
                targetEntity: "WorkOrder",
                type: "one-to-many" as const,
                foreignKey: "workOrderId",
                required: true,
              },
            ],
            operations: ["create", "read", "delete", "list"],
          },
        ],
        dependsOn: ["WorkOrder"],
      },
      {
        name: "WorkOrder",
        domain: "work-orders",
        description: "Work order management",
        entities: [
          {
            name: "WorkOrder",
            pluralName: "WorkOrders",
            fields: [
              { name: "title", type: "string", required: true },
            ],
            relationships: [],
            operations: ["create", "read", "update", "delete", "list"],
          },
        ],
        dependsOn: [],
      },
    ];

    const result = runPlanning(features, "test-api", logger);

    // WorkOrder should come before Assignment
    const names = result.features.map((f) => f.name);
    const workOrderIdx = names.indexOf("WorkOrder");
    const assignmentIdx = names.indexOf("Assignment");
    expect(workOrderIdx).toBeLessThan(assignmentIdx);
  });

  it("should handle single feature with no dependencies", () => {
    const features = [
      {
        name: "Config",
        domain: "config",
        description: "Configuration settings",
        entities: [
          {
            name: "Config",
            pluralName: "Configs",
            fields: [
              { name: "key", type: "string", required: true },
              { name: "value", type: "string", required: true },
            ],
            relationships: [],
            operations: ["create", "read", "update", "delete", "list"],
          },
        ],
        dependsOn: [],
      },
    ];

    const result = runPlanning(features, "config-api", logger);
    expect(result.plan.features).toHaveLength(1);
  });
});

describe("formatPlan", () => {
  it("should produce readable plan output", () => {
    const plan = {
      projectName: "test-api",
      features: [
        {
          name: "User",
          domain: "users",
          description: "User management",
          entities: [
            {
              name: "User",
              pluralName: "Users",
              fields: [
                { name: "id", type: "string", required: true, description: "ULID" },
                { name: "name", type: "string", required: true },
                { name: "email", type: "string", required: true },
                { name: "createdAt", type: "datetime", required: true },
                { name: "updatedAt", type: "datetime", required: true },
              ],
              relationships: [],
              operations: ["create", "read", "update", "delete", "list"],
            },
          ],
          dependsOn: [],
        },
      ],
      steps: [
        { featureName: "User", stepName: "User/interfaces", order: 0, dependsOn: [] },
        { featureName: "User", stepName: "User/schemas", order: 1, dependsOn: ["User/interfaces"] },
      ],
      createdAt: "2026-04-11T00:00:00.000Z",
    };

    const output = formatPlan(plan);
    expect(output).toContain("test-api");
    expect(output).toContain("User");
    expect(output).toContain("Feature Order:");
    expect(output).toContain("Steps:");
  });

  it("should show dependency information", () => {
    const plan = {
      projectName: "api",
      features: [
        {
          name: "Task",
          domain: "tasks",
          description: "Tasks",
          entities: [],
          dependsOn: ["User"],
        },
      ],
      steps: [],
      createdAt: "2026-04-11T00:00:00.000Z",
    };

    const output = formatPlan(plan);
    expect(output).toContain("depends on: User");
  });
});

describe("getRunStatus", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "status-test-"));
  });

  it("should read features.json and return status", async () => {
    const runId = "test-run-001";
    const runDir = join(tmpDir, runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "features.json"),
      JSON.stringify({
        runId,
        createdAt: "2026-04-11T00:00:00.000Z",
        updatedAt: "2026-04-11T01:00:00.000Z",
        features: [
          { id: "f1", name: "Feature 1", status: "complete", iteration: 2 },
          { id: "f2", name: "Feature 2", status: "pending", iteration: 0 },
        ],
      }),
      "utf-8",
    );

    const status = await getRunStatus(runId, tmpDir);
    expect(status.runId).toBe(runId);
    expect(status.features).toHaveLength(2);
    expect(status.features[0]?.status).toBe("complete");
    expect(status.features[1]?.status).toBe("pending");
  });

  it("should throw when features.json does not exist", async () => {
    expect(getRunStatus("nonexistent", tmpDir)).rejects.toThrow(
      "features.json not found",
    );
  });
});

describe("formatRunStatus", () => {
  it("should format status with counts and feature list", () => {
    const status: RunStatus = {
      runId: "test-run",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T01:00:00.000Z",
      features: [
        { id: "f1", name: "Users", status: "complete", iteration: 1 },
        { id: "f2", name: "Orders", status: "failed", iteration: 3, lastError: "Lint failed" },
        { id: "f3", name: "Products", status: "pending", iteration: 0 },
      ],
    };

    const output = formatRunStatus(status);
    expect(output).toContain("test-run");
    expect(output).toContain("Complete:    1");
    expect(output).toContain("Failed:      1");
    expect(output).toContain("Pending:     1");
    expect(output).toContain("[DONE] Users");
    expect(output).toContain("[FAIL] Orders");
    expect(output).toContain("Lint failed");
    expect(output).toContain("[PEND] Products");
  });
});

describe("getResumableFeatures", () => {
  it("should return pending and in-progress features", () => {
    const status: RunStatus = {
      runId: "test",
      createdAt: "",
      updatedAt: "",
      features: [
        { id: "f1", name: "A", status: "complete", iteration: 1 },
        { id: "f2", name: "B", status: "pending", iteration: 0 },
        { id: "f3", name: "C", status: "in-progress", iteration: 2 },
        { id: "f4", name: "D", status: "failed", iteration: 5, lastError: "err" },
      ],
    };

    const resumable = getResumableFeatures(status);
    expect(resumable).toHaveLength(2);
    expect(resumable[0]?.id).toBe("f2");
    expect(resumable[1]?.id).toBe("f3");
  });

  it("should return empty array when all features are done", () => {
    const status: RunStatus = {
      runId: "test",
      createdAt: "",
      updatedAt: "",
      features: [
        { id: "f1", name: "A", status: "complete", iteration: 1 },
        { id: "f2", name: "B", status: "failed", iteration: 3, lastError: "err" },
      ],
    };

    const resumable = getResumableFeatures(status);
    expect(resumable).toHaveLength(0);
  });
});
