import { describe, it, expect } from "bun:test";
import { template } from "../../templates/addons/timer-job/index.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";
import type { IFeatureSpec, IGenerationContext } from "../../src/core/interfaces/index.mts";

const sampleFeature: IFeatureSpec = {
  name: "scheduling",
  domain: "scheduling",
  description: "Scheduled job management",
  entities: [{
    name: "job",
    pluralName: "jobs",
    fields: [{ name: "name", type: "string", required: true }],
    relationships: [],
    operations: ["create", "read", "update", "delete"],
  }],
  dependsOn: [],
};

const sampleContext: IGenerationContext = {
  projectName: "my-api",
  outputDir: "/output",
  existingFiles: new Map(),
};

describe("Timer Job Addon", () => {
  describe("template metadata", () => {
    it("should have correct name", () => {
      expect(template.name).toBe("timer-job");
    });

    it("should be an addon type", () => {
      expect(template.type).toBe(TEMPLATE_TYPE.ADDON);
    });

    it("should have a description mentioning scheduled jobs", () => {
      expect(template.description.length).toBeGreaterThan(0);
    });
  });

  describe("plan", () => {
    it("should plan 3 timer job files", () => {
      const files = template.plan(sampleFeature);
      expect(files).toHaveLength(3);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("src/jobs/interfaces/i-scheduled-job.mts");
      expect(paths).toContain("src/jobs/service/scheduler-service.mts");
      expect(paths).toContain("src/jobs/config/cron-config.mts");
    });
  });

  describe("render", () => {
    it("should render 3 timer job files", () => {
      const files = template.render(sampleFeature, sampleContext);
      expect(files).toHaveLength(3);
    });

    it("should render job interface with required types", () => {
      const files = template.render(sampleFeature, sampleContext);
      const iface = files.find((f) => f.path.includes("i-scheduled-job"));
      expect(iface).toBeDefined();
      expect(iface?.content).toContain("IScheduledJob");
      expect(iface?.content).toContain("IJobContext");
      expect(iface?.content).toContain("IJobResult");
      expect(iface?.content).toContain("IJobError");
      expect(iface?.content).toContain("execute(");
      expect(iface?.content).toContain("onSuccess(");
      expect(iface?.content).toContain("onFailure(");
    });

    it("should render scheduler service with job management", () => {
      const files = template.render(sampleFeature, sampleContext);
      const scheduler = files.find((f) => f.path.includes("scheduler-service"));
      expect(scheduler).toBeDefined();
      expect(scheduler?.content).toContain("SchedulerService");
      expect(scheduler?.content).toContain("registerJob");
      expect(scheduler?.content).toContain("unregisterJob");
      expect(scheduler?.content).toContain("executeJob");
      expect(scheduler?.content).toContain("getRegisteredJobs");
    });

    it("should render scheduler service with execution history", () => {
      const files = template.render(sampleFeature, sampleContext);
      const scheduler = files.find((f) => f.path.includes("scheduler-service"));
      expect(scheduler?.content).toContain("getExecutionHistory");
      expect(scheduler?.content).toContain("executionHistory");
    });

    it("should render cron config with common schedules", () => {
      const files = template.render(sampleFeature, sampleContext);
      const cron = files.find((f) => f.path.includes("cron-config"));
      expect(cron).toBeDefined();
      expect(cron?.content).toContain("COMMON_SCHEDULES");
      expect(cron?.content).toContain("EVERY_MINUTE");
      expect(cron?.content).toContain("DAILY_MIDNIGHT");
      expect(cron?.content).toContain("WEEKLY_MONDAY");
    });

    it("should render cron config with parser and validator", () => {
      const files = template.render(sampleFeature, sampleContext);
      const cron = files.find((f) => f.path.includes("cron-config"));
      expect(cron?.content).toContain("parseCronExpression");
      expect(cron?.content).toContain("isValidCronExpression");
      expect(cron?.content).toContain("describeCronExpression");
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

    it("should detect missing required types in job interface", () => {
      const files = [
        { path: "src/jobs/interfaces/i-scheduled-job.mts", content: "export interface IFoo {}" },
        { path: "src/jobs/service/scheduler-service.mts", content: "content" },
        { path: "src/jobs/config/cron-config.mts", content: "content" },
      ];
      const result = template.validate(files);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("IScheduledJob"))).toBe(true);
    });
  });
});
