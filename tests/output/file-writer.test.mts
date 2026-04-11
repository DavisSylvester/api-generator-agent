import { describe, it, expect, mock } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWriter } from "../../src/output/file-writer.mts";
import type { Logger } from "winston";

const mockLogger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
  debug: mock(() => undefined),
} as unknown as Logger;

describe("FileWriter", () => {
  it("should write a single file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "file-writer-test-"));
    const writer = new FileWriter(tmpDir, mockLogger);

    const result = await writer.writeFile({
      path: "src/test.mts",
      content: 'export const hello = "world";',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = await readFile(result.value, "utf-8");
      expect(content).toBe('export const hello = "world";');
    }
  });

  it("should create nested directories", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "file-writer-test-"));
    const writer = new FileWriter(tmpDir, mockLogger);

    const result = await writer.writeFile({
      path: "src/deep/nested/file.mts",
      content: "export const x = 1;",
    });

    expect(result.ok).toBe(true);
  });

  it("should write multiple files", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "file-writer-test-"));
    const writer = new FileWriter(tmpDir, mockLogger);

    const result = await writer.writeFiles([
      { path: "file1.mts", content: "const a = 1;" },
      { path: "file2.mts", content: "const b = 2;" },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });
});
