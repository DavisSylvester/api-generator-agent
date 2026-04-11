import { describe, it, expect, mock } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitOps } from "../../src/git/git-ops.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("GitOps", () => {
  it("should initialize a git repository", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    const result = await git.init();
    expect(result.ok).toBe(true);
  });

  it("should commit changes", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");

    const result = await git.commit("test: initial commit");
    expect(result.ok).toBe(true);
  });

  it("should get last commit hash after commit", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commit("test: initial commit");

    const hashResult = await git.getLastCommitHash();
    expect(hashResult.ok).toBe(true);
    if (hashResult.ok) {
      expect(hashResult.value.length).toBeGreaterThan(0);
    }
  });

  it("should return error for empty repo with no commits", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();

    const hashResult = await git.getLastCommitHash();
    expect(hashResult.ok).toBe(false);
  });

  it("should commit feature with conventional message", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "feature.txt"), "feature code");

    const result = await git.commitFeature("work-orders");
    expect(result.ok).toBe(true);
  });

  it("should commit infrastructure", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "infra.txt"), "infra code");

    const result = await git.commitInfrastructure("my-api");
    expect(result.ok).toBe(true);
  });

  it("should skip commit when no staged changes", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commit("test: initial commit");

    // Commit again with no changes — should succeed (no-op)
    const result = await git.commit("test: no changes");
    expect(result.ok).toBe(true);
  });

  it("should not commit when verification failed (commitVerified)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");

    const result = await git.commitVerified("work-orders", false);
    expect(result.ok).toBe(true);

    // Should not have committed
    const hashResult = await git.getLastCommitHash();
    expect(hashResult.ok).toBe(false);
  });

  it("should commit when verification passed (commitVerified)", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");

    const result = await git.commitVerified("work-orders", true);
    expect(result.ok).toBe(true);

    const hashResult = await git.getLastCommitHash();
    expect(hashResult.ok).toBe(true);
  });

  it("should save checkpoint and retrieve last good commit", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "hello");
    await git.commit("test: initial");

    const checkpointResult = await git.saveCheckpoint();
    expect(checkpointResult.ok).toBe(true);

    const lastGood = await git.getLastGoodCommit();
    expect(lastGood).toBeDefined();
    if (checkpointResult.ok) {
      expect(lastGood).toBe(checkpointResult.value);
    }
  });

  it("should rollback to last good commit", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "test.txt"), "first");
    await git.commit("test: first");
    await git.saveCheckpoint();

    await Bun.write(join(tmpDir, "test.txt"), "second");
    await git.commit("test: second");

    const rollbackResult = await git.rollbackToLastGood();
    expect(rollbackResult.ok).toBe(true);
  });

  it("should fail rollback when no good commit saved", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();

    const result = await git.rollbackToLastGood();
    expect(result.ok).toBe(false);
  });

  it("should get log entries", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "git-ops-test-"));
    const git = new GitOps(tmpDir, mockLogger);

    await git.init();
    await Bun.write(join(tmpDir, "a.txt"), "a");
    await git.commit("test: first commit");
    await Bun.write(join(tmpDir, "b.txt"), "b");
    await git.commit("test: second commit");

    const logResult = await git.getLog(5);
    expect(logResult.ok).toBe(true);
    if (logResult.ok) {
      expect(logResult.value.length).toBe(2);
      expect(logResult.value[0]).toContain("second commit");
      expect(logResult.value[1]).toContain("first commit");
    }
  });
});
