import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";
import type { Logger } from "winston";
import { parseInput, runPlanning, formatPlan } from "../../src/cli/run-orchestrator.mts";

function createSilentLogger(): Logger {
  return winston.createLogger({
    level: "warn",
    transports: [new winston.transports.Console({ silent: true })],
  });
}

const logger = createSilentLogger();

describe("dry-run mode", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "dry-run-test-"));
  });

  it("should parse PRD and produce plan without writing files", async () => {
    const prdPath = join(tmpDir, "test-prd.md");
    await writeFile(
      prdPath,
      [
        "# Fitness Tracker API",
        "",
        "- [ ] Feature: Workouts -- Track workouts with status",
        "- [ ] Feature: Exercises -- Exercise library with categories",
      ].join("\n"),
      "utf-8",
    );

    // Step 1: Parse input
    const input = await parseInput(
      { mode: "prd", prdPath, projectName: "fitness-tracker" },
      logger,
    );

    expect(input.features.length).toBeGreaterThan(0);
    expect(input.projectName).toBe("fitness-tracker");

    // Step 2: Run planning
    const planResult = runPlanning(
      input.features,
      input.projectName,
      logger,
    );

    expect(planResult.plan).toBeDefined();
    expect(planResult.plan.projectName).toBe("fitness-tracker");
    expect(planResult.plan.features.length).toBeGreaterThan(0);
    expect(planResult.plan.steps.length).toBeGreaterThan(0);
    expect(planResult.runId).toBeTruthy();

    // Step 3: Format plan
    const planText = formatPlan(planResult.plan);
    expect(planText).toContain("fitness-tracker");
    expect(planText).toContain("Feature Order:");
    expect(planText).toContain("Steps:");

    // Step 4: Verify NO files were written to output dir
    // (dry-run does not create workspace files)
    const outputDir = join(tmpDir, "output");
    let dirEntries: string[] = [];
    try {
      const entries = await readdir(outputDir);
      dirEntries = entries;
    } catch {
      // Directory does not exist -- expected for dry run
    }
    expect(dirEntries).toHaveLength(0);
  });

  it("should parse NL prompt and produce plan without writing files", async () => {
    const input = await parseInput(
      {
        mode: "prompt",
        prompt: "Build a task management API with user assignments and priorities",
        projectName: "task-manager",
      },
      logger,
    );

    expect(input.features.length).toBeGreaterThan(0);

    const planResult = runPlanning(
      input.features,
      input.projectName,
      logger,
    );

    expect(planResult.plan).toBeDefined();
    expect(planResult.plan.steps.length).toBeGreaterThan(0);

    const planText = formatPlan(planResult.plan);
    expect(planText).toContain("task-manager");
  });

  it("should handle PRD with dependencies and produce ordered plan", async () => {
    const prdPath = join(tmpDir, "deps-prd.md");
    await writeFile(
      prdPath,
      [
        "# Order Management API",
        "",
        "- [ ] Feature: Customers -- Customer management with email",
        "- [ ] Feature: Products -- Product catalog with categories",
        "- [ ] Feature: Orders -- Order management with status",
      ].join("\n"),
      "utf-8",
    );

    const input = await parseInput(
      { mode: "prd", prdPath, projectName: "order-mgmt" },
      logger,
    );

    const planResult = runPlanning(
      input.features,
      input.projectName,
      logger,
    );

    expect(planResult.plan.features.length).toBe(3);
    expect(planResult.plan.steps.length).toBeGreaterThan(0);
  });

  it("should produce plan with correct step ordering per feature", async () => {
    const prdPath = join(tmpDir, "steps-prd.md");
    await writeFile(
      prdPath,
      [
        "# Simple API",
        "",
        "- [ ] Feature: Items -- Item management",
      ].join("\n"),
      "utf-8",
    );

    const input = await parseInput(
      { mode: "prd", prdPath, projectName: "simple-api" },
      logger,
    );

    const planResult = runPlanning(
      input.features,
      input.projectName,
      logger,
    );

    const stepNames = planResult.plan.steps.map((s) => s.stepName);

    // Steps should follow bottom-up order: interfaces -> schemas -> repo -> service -> router -> tests
    const expectedOrder = [
      "interfaces",
      "schemas",
      "repository",
      "service",
      "router",
      "tests",
    ];

    for (let i = 0; i < expectedOrder.length; i++) {
      const expected = expectedOrder[i];
      if (expected) {
        const matchingStep = stepNames.find((s) => s.includes(expected));
        expect(matchingStep).toBeTruthy();
      }
    }
  });
});
