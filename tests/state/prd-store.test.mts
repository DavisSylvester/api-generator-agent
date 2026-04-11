import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";
import { PrdStore } from "../../src/state/prd-store.mts";

const silentLogger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()],
});

const SAMPLE_PRD = `# Test API — PRD

## Features

- [ ] Feature: WorkOrders — CRUD for work orders with status tracking
- [ ] Feature: Users — User management with email
- [x] Feature: Auth — Authentication and authorization
- [ ] Feature: Assets — Asset tracking with categories

## Business Rules

Some rules here.
`;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "prd-store-test-"));
});

describe("PrdStore", () => {
  describe("create and load", () => {
    it("should create a PRD file and parse checkboxes", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");

      const state = await store.create(filePath, SAMPLE_PRD);

      expect(state.items).toHaveLength(4);
      expect(state.checkedCount).toBe(1);
      expect(state.totalCount).toBe(4);
    });

    it("should load an existing PRD file", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      // Create a new instance and load
      const store2 = new PrdStore(silentLogger);
      const state = await store2.load(filePath);

      expect(state.items).toHaveLength(4);
      expect(state.checkedCount).toBe(1);
    });

    it("should identify checked and unchecked items", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const pending = store.getPendingFeatures();
      const completed = store.getCompletedFeatures();

      expect(pending).toHaveLength(3);
      expect(pending).toContain("WorkOrders");
      expect(pending).toContain("Users");
      expect(pending).toContain("Assets");

      expect(completed).toHaveLength(1);
      expect(completed).toContain("Auth");
    });
  });

  describe("markFeatureComplete", () => {
    it("should check an unchecked feature", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureComplete("WorkOrders");
      expect(result).toBe(true);

      const content = store.getContent();
      expect(content).toContain("- [x] Feature: WorkOrders");
    });

    it("should persist changes to disk", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      await store.markFeatureComplete("WorkOrders");

      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toContain("- [x] Feature: WorkOrders");
    });

    it("should update progress counters", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      await store.markFeatureComplete("WorkOrders");
      await store.markFeatureComplete("Users");

      const progress = store.getProgress();
      expect(progress.checked).toBe(3); // Auth + WorkOrders + Users
      expect(progress.total).toBe(4);
    });

    it("should return true for already-checked feature", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureComplete("Auth");
      expect(result).toBe(true);
    });

    it("should return false for unknown feature", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureComplete("NonExistent");
      expect(result).toBe(false);
    });

    it("should match feature names case-insensitively", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureComplete("workorders");
      expect(result).toBe(true);
    });

    it("should return false when no PRD is loaded", async () => {
      const store = new PrdStore(silentLogger);
      const result = await store.markFeatureComplete("WorkOrders");
      expect(result).toBe(false);
    });
  });

  describe("markFeatureIncomplete", () => {
    it("should uncheck a checked feature", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureIncomplete("Auth");
      expect(result).toBe(true);

      const content = store.getContent();
      expect(content).toContain("- [ ] Feature: Auth");
    });

    it("should update progress counters on uncheck", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      await store.markFeatureIncomplete("Auth");

      const progress = store.getProgress();
      expect(progress.checked).toBe(0);
      expect(progress.total).toBe(4);
    });

    it("should return true for already-unchecked feature", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      const result = await store.markFeatureIncomplete("WorkOrders");
      expect(result).toBe(true);
    });
  });

  describe("getProgress", () => {
    it("should return zero progress when no PRD loaded", () => {
      const store = new PrdStore(silentLogger);
      const progress = store.getProgress();
      expect(progress.checked).toBe(0);
      expect(progress.total).toBe(0);
    });
  });

  describe("getContent and getFilePath", () => {
    it("should return empty string when no PRD loaded", () => {
      const store = new PrdStore(silentLogger);
      expect(store.getContent()).toBe("");
      expect(store.getFilePath()).toBe("");
    });

    it("should return content and path after loading", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      expect(store.getContent()).toBe(SAMPLE_PRD);
      expect(store.getFilePath()).toBe(filePath);
    });
  });

  describe("round-trip", () => {
    it("should survive a full check-uncheck-check cycle", async () => {
      const store = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store.create(filePath, SAMPLE_PRD);

      // Check
      await store.markFeatureComplete("WorkOrders");
      expect(store.getCompletedFeatures()).toContain("WorkOrders");

      // Uncheck
      await store.markFeatureIncomplete("WorkOrders");
      expect(store.getPendingFeatures()).toContain("WorkOrders");

      // Check again
      await store.markFeatureComplete("WorkOrders");
      expect(store.getCompletedFeatures()).toContain("WorkOrders");

      // Verify disk state
      const diskContent = await readFile(filePath, "utf-8");
      expect(diskContent).toContain("- [x] Feature: WorkOrders");
    });

    it("should persist across store instances", async () => {
      const store1 = new PrdStore(silentLogger);
      const filePath = join(tmpDir, "prd.md");
      await store1.create(filePath, SAMPLE_PRD);
      await store1.markFeatureComplete("WorkOrders");

      const store2 = new PrdStore(silentLogger);
      await store2.load(filePath);

      expect(store2.getCompletedFeatures()).toContain("WorkOrders");
      expect(store2.getCompletedFeatures()).toContain("Auth");
      expect(store2.getProgress().checked).toBe(2);
    });
  });
});
