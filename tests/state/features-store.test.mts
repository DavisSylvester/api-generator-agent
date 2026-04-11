import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeaturesStore } from "../../src/state/features-store.mts";

let tmpDir: string;
let store: FeaturesStore;

const TEST_RUN_ID = "test-run-001";

const testFeatures = [
  { id: "setup-foundation", name: "Setup Foundation" },
  { id: "model-user", name: "User Model" },
  { id: "service-auth", name: "Auth Service" },
];

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "features-store-test-"));
  store = new FeaturesStore(tmpDir, TEST_RUN_ID);
  await store.init(TEST_RUN_ID, testFeatures);
});

describe("FeaturesStore", () => {
  describe("init", () => {
    it("should initialize all features as pending", async () => {
      const all = await store.getAll();
      expect(all).toHaveLength(3);
      for (const f of all) {
        expect(f.status).toBe("pending");
        expect(f.iteration).toBe(0);
      }
    });

    it("should set feature ids and names correctly", async () => {
      const all = await store.getAll();
      expect(all[0]?.id).toBe("setup-foundation");
      expect(all[0]?.name).toBe("Setup Foundation");
      expect(all[1]?.id).toBe("model-user");
    });
  });

  describe("markInProgress", () => {
    it("should set status to in-progress and set startedAt", async () => {
      await store.markInProgress("setup-foundation");
      const all = await store.getAll();
      const feature = all.find((f) => f.id === "setup-foundation");
      expect(feature?.status).toBe("in-progress");
      expect(feature?.startedAt).toBeTruthy();
    });

    it("should not affect other features", async () => {
      await store.markInProgress("setup-foundation");
      const pending = await store.getByStatus("pending");
      expect(pending).toHaveLength(2);
    });
  });

  describe("markComplete", () => {
    it("should set status to complete with iteration and completedAt", async () => {
      await store.markInProgress("model-user");
      await store.markComplete("model-user", 2);
      const all = await store.getAll();
      const feature = all.find((f) => f.id === "model-user");
      expect(feature?.status).toBe("complete");
      expect(feature?.iteration).toBe(2);
      expect(feature?.completedAt).toBeTruthy();
      expect(feature?.lastError).toBeUndefined();
    });
  });

  describe("markFailed", () => {
    it("should set status to failed with error message", async () => {
      await store.markInProgress("service-auth");
      await store.markFailed("service-auth", 5, "Max iterations exceeded");
      const all = await store.getAll();
      const feature = all.find((f) => f.id === "service-auth");
      expect(feature?.status).toBe("failed");
      expect(feature?.lastError).toBe("Max iterations exceeded");
      expect(feature?.iteration).toBe(5);
    });
  });

  describe("getByStatus", () => {
    it("should return only features with matching status", async () => {
      await store.markInProgress("setup-foundation");
      await store.markComplete("setup-foundation", 1);
      await store.markFailed("model-user", 5, "Failed");

      const complete = await store.getByStatus("complete");
      expect(complete).toHaveLength(1);
      expect(complete[0]?.id).toBe("setup-foundation");

      const failed = await store.getByStatus("failed");
      expect(failed).toHaveLength(1);
      expect(failed[0]?.id).toBe("model-user");

      const pending = await store.getByStatus("pending");
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe("service-auth");
    });
  });

  describe("persistence", () => {
    it("should persist and reload data across store instances", async () => {
      await store.markComplete("setup-foundation", 1);

      // Create a new store instance pointing to same file
      const store2 = new FeaturesStore(tmpDir, TEST_RUN_ID);
      const all = await store2.getAll();
      const feature = all.find((f) => f.id === "setup-foundation");
      expect(feature?.status).toBe("complete");
    });
  });
});
