import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";
import type { Logger } from "winston";
import { parseArgs, CLI_COMMANDS } from "../../src/cli/arg-parser.mts";
import {
  parseInput,
  runPlanning,
  formatPlan,
  getRunStatus,
  formatRunStatus,
  getResumableFeatures,
} from "../../src/cli/run-orchestrator.mts";
import { FeaturesStore } from "../../src/state/features-store.mts";

function createSilentLogger(): Logger {
  return winston.createLogger({
    level: "warn",
    transports: [new winston.transports.Console({ silent: true })],
  });
}

const logger = createSilentLogger();

describe("E2E: parse PRD -> plan -> verify structure", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "e2e-test-"));
  });

  it("should parse a test PRD, plan, and produce correct output structure", async () => {
    // 1. Write a test PRD
    const prdPath = join(tmpDir, "test-prd.md");
    await writeFile(
      prdPath,
      [
        "# Work Order Management API",
        "",
        "- [ ] Feature: Work Orders -- CRUD for work orders with status and priority",
        "- [ ] Feature: Technicians -- Technician management with email and specialization",
        "- [ ] Feature: Assignments -- Assignment tracking with status",
      ].join("\n"),
      "utf-8",
    );

    // 2. Parse CLI args
    const parseResult = parseArgs([
      "generate",
      "work-order-api",
      "--prd",
      prdPath,
      "--dry-run",
    ]);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(parseResult.value.command).toBe(CLI_COMMANDS.GENERATE);

    // 3. Parse input
    if (parseResult.value.command !== CLI_COMMANDS.GENERATE) return;
    const input = await parseInput(
      {
        mode: "prd",
        prdPath: parseResult.value.prdPath,
        projectName: parseResult.value.projectName,
      },
      logger,
    );

    expect(input.features.length).toBe(3);
    expect(input.projectName).toBe("work-order-api");

    // 4. Run planning
    const planResult = runPlanning(
      input.features,
      input.projectName,
      logger,
    );

    expect(planResult.plan.projectName).toBe("work-order-api");
    expect(planResult.plan.features).toHaveLength(3);
    expect(planResult.plan.steps.length).toBeGreaterThan(0);

    // 5. Verify plan output
    const planText = formatPlan(planResult.plan);
    expect(planText).toContain("work-order-api");
    expect(planText).toContain("Feature Order:");
    expect(planText).toContain("Steps:");

    // 6. Each feature should have 6 steps (interfaces, schemas, repo, service, router, tests)
    const featureNames = planResult.plan.features.map((f) => f.name);
    for (const featureName of featureNames) {
      const featureSteps = planResult.plan.steps.filter(
        (s) => s.featureName === featureName,
      );
      expect(featureSteps).toHaveLength(6);
    }
  });
});

describe("E2E: resume logic reads features.json", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "e2e-resume-"));
  });

  it("should read features.json and identify resumable features", async () => {
    const runId = "test-run-resume";

    // 1. Initialize a features store with some completed features
    const store = new FeaturesStore(tmpDir, runId);
    await store.init(runId, [
      { id: "setup", name: "Setup" },
      { id: "users", name: "Users" },
      { id: "orders", name: "Orders" },
      { id: "payments", name: "Payments" },
    ]);

    // Mark some as complete, one as failed, one pending
    await store.markInProgress("setup");
    await store.markComplete("setup", 1);
    await store.markInProgress("users");
    await store.markComplete("users", 2);
    await store.markInProgress("orders");
    await store.markFailed("orders", 5, "ESLint gate failed");

    // 2. Read status via orchestrator
    const status = await getRunStatus(runId, tmpDir);
    expect(status.runId).toBe(runId);
    expect(status.features).toHaveLength(4);

    // 3. Format status
    const formatted = formatRunStatus(status);
    expect(formatted).toContain("Complete:    2");
    expect(formatted).toContain("Failed:      1");
    expect(formatted).toContain("Pending:     1");

    // 4. Identify resumable features
    const resumable = getResumableFeatures(status);
    expect(resumable).toHaveLength(1);
    expect(resumable[0]?.id).toBe("payments");
    expect(resumable[0]?.status).toBe("pending");
  });

  it("should handle all-complete run gracefully", async () => {
    const runId = "all-done-run";

    const store = new FeaturesStore(tmpDir, runId);
    await store.init(runId, [
      { id: "f1", name: "Feature 1" },
      { id: "f2", name: "Feature 2" },
    ]);
    await store.markComplete("f1", 1);
    await store.markComplete("f2", 1);

    const status = await getRunStatus(runId, tmpDir);
    const resumable = getResumableFeatures(status);

    expect(resumable).toHaveLength(0);
  });

  it("should include in-progress features as resumable", async () => {
    const runId = "in-progress-run";

    const store = new FeaturesStore(tmpDir, runId);
    await store.init(runId, [
      { id: "f1", name: "Feature 1" },
      { id: "f2", name: "Feature 2" },
    ]);
    await store.markComplete("f1", 1);
    await store.markInProgress("f2");

    const status = await getRunStatus(runId, tmpDir);
    const resumable = getResumableFeatures(status);

    expect(resumable).toHaveLength(1);
    expect(resumable[0]?.id).toBe("f2");
    expect(resumable[0]?.status).toBe("in-progress");
  });
});

describe("E2E: CLI arg parsing for all commands", () => {
  it("should parse all four commands correctly", () => {
    const commands = [
      { argv: ["generate", "api", "--prd", "f.md"], expected: CLI_COMMANDS.GENERATE },
      { argv: ["resume", "run-123"], expected: CLI_COMMANDS.RESUME },
      { argv: ["status", "run-123"], expected: CLI_COMMANDS.STATUS },
      { argv: ["trace", "run-123"], expected: CLI_COMMANDS.TRACE },
    ];

    for (const tc of commands) {
      const result = parseArgs(tc.argv);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.command).toBe(tc.expected);
      }
    }
  });

  it("should reject invalid commands with helpful errors", () => {
    const invalidCases = [
      { argv: [], expectedMsg: "No command" },
      { argv: ["generate"], expectedMsg: "project name" },
      { argv: ["generate", "api"], expectedMsg: "--prd" },
      { argv: ["resume"], expectedMsg: "run ID" },
      { argv: ["status"], expectedMsg: "run ID" },
      { argv: ["trace"], expectedMsg: "run ID" },
      { argv: ["foobar"], expectedMsg: "Unknown command" },
    ];

    for (const tc of invalidCases) {
      const result = parseArgs(tc.argv);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain(tc.expectedMsg);
      }
    }
  });
});
