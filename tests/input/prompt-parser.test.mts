import { describe, it, expect } from "bun:test";
import { parsePrompt } from "../../src/input/prompt-parser.mts";

describe("parsePrompt", () => {
  it("should extract entities from management patterns", () => {
    const features = parsePrompt("Build a work order management API");
    expect(features.length).toBeGreaterThanOrEqual(1);
    const names = features.map((f) => f.name.toLowerCase());
    expect(names.some((n) => n.includes("order") || n.includes("work"))).toBe(true);
  });

  it("should return empty array for empty prompt", () => {
    const features = parsePrompt("");
    expect(features).toHaveLength(0);
  });

  it("should generate default CRUD operations", () => {
    const features = parsePrompt("Build a WorkOrder tracking system");
    if (features.length > 0) {
      const entity = features[0]?.entities[0];
      expect(entity?.operations).toContain("create");
      expect(entity?.operations).toContain("read");
      expect(entity?.operations).toContain("update");
      expect(entity?.operations).toContain("delete");
    }
  });

  it("should use kebab-case for domain names", () => {
    const features = parsePrompt("Build a WorkOrder management system");
    for (const feature of features) {
      expect(feature.domain).not.toMatch(/[A-Z]/);
    }
  });
});
