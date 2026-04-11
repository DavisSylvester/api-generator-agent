import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";
import { AddonDiscovery } from "../../src/generation/addon-discovery.mts";

const logger = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()],
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "addon-discovery-test-"));
});

describe("AddonDiscovery", () => {
  describe("discover - empty/missing directory", () => {
    it("should return empty results when addons directory does not exist", async () => {
      const discovery = new AddonDiscovery(logger, join(tmpDir, "nonexistent"));
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.scannedPaths).toHaveLength(0);
    });

    it("should return empty results when addons directory is empty", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("discover - invalid addons", () => {
    it("should report error when addon directory has no index.mts", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      await mkdir(join(addonsDir, "broken-addon"));
      await writeFile(join(addonsDir, "broken-addon", "readme.md"), "not an addon");

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.reason).toContain("No index.mts found");
      expect(result.scannedPaths).toHaveLength(1);
    });

    it("should report error when addon exports invalid template", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      await mkdir(join(addonsDir, "bad-template"));
      await writeFile(
        join(addonsDir, "bad-template", "index.mts"),
        "export const template = { name: 123 };",
      );

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.reason).toContain("contract validation failed");
    });

    it("should report error when addon module has syntax errors", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      await mkdir(join(addonsDir, "syntax-error"));
      await writeFile(
        join(addonsDir, "syntax-error", "index.mts"),
        "export const template = {{{INVALID",
      );

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.reason).toContain("Failed to import");
    });
  });

  describe("discover - valid addons", () => {
    it("should load a valid addon template", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      await mkdir(join(addonsDir, "valid-addon"));
      await writeFile(
        join(addonsDir, "valid-addon", "index.mts"),
        `export const template = {
  name: "valid-addon",
  type: "addon",
  description: "A valid test addon",
  plan: () => [{ path: "test.mts", description: "test file" }],
  render: () => [{ path: "test.mts", content: "// test" }],
  validate: () => ({ valid: true, errors: [] }),
};`,
      );

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.addons[0]?.template.name).toBe("valid-addon");
      expect(result.addons[0]?.template.type).toBe("addon");
    });

    it("should load multiple valid addon templates", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);

      for (const name of ["addon-a", "addon-b", "addon-c"]) {
        await mkdir(join(addonsDir, name));
        await writeFile(
          join(addonsDir, name, "index.mts"),
          `export const template = {
  name: "${name}",
  type: "addon",
  description: "Test addon ${name}",
  plan: () => [],
  render: () => [],
  validate: () => ({ valid: true, errors: [] }),
};`,
        );
      }

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.scannedPaths).toHaveLength(3);
    });

    it("should skip files (non-directories) in addons dir", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);
      await writeFile(join(addonsDir, "readme.md"), "not a directory");
      await mkdir(join(addonsDir, "real-addon"));
      await writeFile(
        join(addonsDir, "real-addon", "index.mts"),
        `export const template = {
  name: "real-addon",
  type: "addon",
  description: "test",
  plan: () => [],
  render: () => [],
  validate: () => ({ valid: true, errors: [] }),
};`,
      );

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(1);
      expect(result.scannedPaths).toHaveLength(1);
    });
  });

  describe("discover - mixed valid and invalid", () => {
    it("should load valid addons and report errors for invalid ones", async () => {
      const addonsDir = join(tmpDir, "addons");
      await mkdir(addonsDir);

      // Valid addon
      await mkdir(join(addonsDir, "good-addon"));
      await writeFile(
        join(addonsDir, "good-addon", "index.mts"),
        `export const template = {
  name: "good-addon",
  type: "addon",
  description: "works",
  plan: () => [],
  render: () => [],
  validate: () => ({ valid: true, errors: [] }),
};`,
      );

      // Invalid: no index.mts
      await mkdir(join(addonsDir, "no-index"));
      await writeFile(join(addonsDir, "no-index", "readme.md"), "missing index");

      // Invalid: bad contract
      await mkdir(join(addonsDir, "bad-contract"));
      await writeFile(
        join(addonsDir, "bad-contract", "index.mts"),
        "export const template = { name: 42 };",
      );

      const discovery = new AddonDiscovery(logger, addonsDir);
      const result = await discovery.discover();
      expect(result.addons).toHaveLength(1);
      expect(result.addons[0]?.template.name).toBe("good-addon");
      expect(result.errors).toHaveLength(2);
      expect(result.scannedPaths).toHaveLength(3);
    });
  });

  describe("getAddonsDir", () => {
    it("should return the resolved addons directory", () => {
      const discovery = new AddonDiscovery(logger, "/some/path/addons");
      expect(discovery.getAddonsDir()).toContain("addons");
    });
  });
});
