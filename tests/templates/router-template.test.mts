import { describe, it, expect } from "bun:test";
import { renderRouter, renderRouterBarrel } from "../../templates/base/router.tmpl.mts";
import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

const sampleEntity: IEntitySpec = {
  name: "work-order",
  pluralName: "work-orders",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "status", type: "string", required: true },
  ],
  relationships: [],
  operations: ["create", "read", "update", "delete", "list"],
};

describe("router.tmpl", () => {
  describe("renderRouter", () => {
    it("should render a router factory function", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain("export function createWorkOrderRouter");
    });

    it("should use /v1/ prefix", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain('prefix: "/v1/work-orders"');
    });

    it("should NOT use /api prefix", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).not.toContain("/api/");
    });

    it("should include all CRUD endpoints", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain('.post("/",');
      expect(output).toContain('.get("/",');
      expect(output).toContain('.get("/:id",');
      expect(output).toContain('.put("/:id",');
      expect(output).toContain('.delete("/:id",');
    });

    it("should return standardized response format", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain("{ success: true, data:");
      expect(output).toContain("{ success: false, error:");
    });

    it("should import Zod schemas for validation", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain("createWorkOrderSchema");
      expect(output).toContain("updateWorkOrderSchema");
      expect(output).toContain("workOrderIdParamSchema");
    });

    it("should handle 404 for not found", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain("set.status = 404");
      expect(output).toContain("not found");
    });

    it("should use try-catch with logger.error", () => {
      const output = renderRouter(sampleEntity, "work-orders");
      expect(output).toContain("try {");
      expect(output).toContain("catch (error)");
      expect(output).toContain("logger.error");
    });
  });

  describe("renderRouterBarrel", () => {
    it("should export the router factory", () => {
      const output = renderRouterBarrel(sampleEntity);
      expect(output).toContain("createWorkOrderRouter");
      expect(output).toContain(".mjs");
    });
  });
});
