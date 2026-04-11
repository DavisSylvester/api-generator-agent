import { describe, it, expect } from "bun:test";
import { parsePrd } from "../../src/input/prd-parser.mts";

describe("parsePrd", () => {
  it("should parse features from checkbox lines", () => {
    const prd = `# My API
- [ ] Feature: Work Orders - CRUD for work orders with status tracking
- [ ] Feature: Users - User management with email
- [x] Feature: Auth - Authentication and authorization`;

    const result = parsePrd(prd);
    expect(result.features).toHaveLength(3);
    expect(result.pendingFeatures).toHaveLength(2);
    expect(result.completedFeatures).toHaveLength(1);
    expect(result.completedFeatures[0]).toBe("Auth");
  });

  it("should extract project name from heading", () => {
    const prd = `# My Project API
- [ ] Feature: Orders`;

    const result = parsePrd(prd);
    expect(result.projectName).toBe("My Project");
  });

  it("should handle empty PRD", () => {
    const result = parsePrd("");
    expect(result.features).toHaveLength(0);
    expect(result.projectName).toBe("my-project");
  });

  it("should extract field hints from description", () => {
    const prd = `# Test
- [ ] Feature: Tasks - Task management with status and priority`;

    const result = parsePrd(prd);
    const entity = result.features[0]?.entities[0];
    const fieldNames = entity?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("priority");
  });

  it("should use kebab-case for domain", () => {
    const prd = `# Test
- [ ] Feature: WorkOrders - Work order management`;

    const result = parsePrd(prd);
    expect(result.features[0]?.domain).not.toMatch(/[A-Z]/);
  });
});
