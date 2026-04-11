import { describe, it, expect } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../../src/state/session-store.mts";
import type { TaskState } from "../../src/types/task.mts";

const TEST_RUN_ID = "test-run-session";

const sampleTaskStates: TaskState[] = [
  { taskId: "setup-foundation", status: "completed", iteration: 1 },
  { taskId: "model-user", status: "completed", iteration: 2 },
  { taskId: "service-auth", status: "failed", iteration: 5, lastError: "Max iterations exceeded" },
  { taskId: "endpoint-users", status: "skipped", iteration: 0, lastError: "Dependency failed" },
];

describe("SessionStore", () => {
  describe("generateHandoff", () => {
    it("should generate markdown and write SESSION-HANDOFF.md", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
      const store = new SessionStore();

      const markdown = await store.generateHandoff(TEST_RUN_ID, sampleTaskStates, tmpDir, "test-prd.md");

      expect(markdown).toContain("# Session Handoff");
      expect(markdown).toContain(TEST_RUN_ID);
      expect(markdown).toContain("test-prd.md");

      const fileContent = await readFile(`${tmpDir}/${TEST_RUN_ID}/SESSION-HANDOFF.md`, "utf-8");
      expect(fileContent).toBe(markdown);
    });

    it("should include task summary table", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
      const store = new SessionStore();

      const markdown = await store.generateHandoff(TEST_RUN_ID, sampleTaskStates, tmpDir);

      expect(markdown).toContain("setup-foundation");
      expect(markdown).toContain("DONE");
      expect(markdown).toContain("FAIL");
      expect(markdown).toContain("SKIP");
    });

    it("should include failed task error details", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
      const store = new SessionStore();

      const markdown = await store.generateHandoff(TEST_RUN_ID, sampleTaskStates, tmpDir);

      expect(markdown).toContain("Failed Tasks");
      expect(markdown).toContain("service-auth");
      expect(markdown).toContain("Max iterations exceeded");
    });

    it("should show success next steps when all tasks complete", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
      const store = new SessionStore();

      const allComplete: TaskState[] = [
        { taskId: "setup-foundation", status: "completed", iteration: 1 },
        { taskId: "model-user", status: "completed", iteration: 1 },
      ];

      const markdown = await store.generateHandoff(TEST_RUN_ID, allComplete, tmpDir);

      expect(markdown).toContain("All tasks completed successfully");
    });

    it("should report correct counts in summary", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
      const store = new SessionStore();

      const markdown = await store.generateHandoff(TEST_RUN_ID, sampleTaskStates, tmpDir);

      expect(markdown).toContain("Completed | 2");
      expect(markdown).toContain("Failed | 1");
      expect(markdown).toContain("Skipped | 1");
      expect(markdown).toContain("Total | 4");
    });
  });
});
