import { describe, it, expect } from "bun:test";
import { renderValidationSchema, renderSchemaBarrel } from "../../templates/base/schema.tmpl.mts";
import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

const sampleEntity: IEntitySpec = {
  name: "work-order",
  pluralName: "work-orders",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "email", type: "email", required: true },
    { name: "count", type: "number", required: false },
    { name: "isActive", type: "boolean", required: true },
  ],
  relationships: [],
  operations: ["create", "read", "update", "delete", "list"],
};

describe("schema.tmpl", () => {
  describe("renderValidationSchema", () => {
    it("should render create and update Zod schemas", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("import { z } from \"zod\"");
      expect(output).toContain("createWorkOrderSchema");
      expect(output).toContain("updateWorkOrderSchema");
    });

    it("should render correct Zod types for fields", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("z.string()");
      expect(output).toContain("z.string().email()");
      expect(output).toContain("z.number()");
      expect(output).toContain("z.boolean()");
    });

    it("should render id param schema using ulid", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("workOrderIdParamSchema");
      expect(output).toContain("z.string().ulid()");
    });

    it("should render query schema with pagination", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("workOrderQuerySchema");
      expect(output).toContain("page:");
      expect(output).toContain("limit:");
    });

    it("should derive types with z.infer", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("z.infer<typeof createWorkOrderSchema>");
      expect(output).toContain("z.infer<typeof updateWorkOrderSchema>");
    });

    it("should make optional fields optional in update schema", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      // All fields in update schema should have .optional()
      const updateSection = output.split("updateWorkOrderSchema")[1];
      expect(updateSection).toContain(".optional()");
    });
  });

  describe("renderSchemaBarrel", () => {
    it("should export schemas and types", () => {
      const output = renderSchemaBarrel(sampleEntity);
      expect(output).toContain("createWorkOrderSchema");
      expect(output).toContain("updateWorkOrderSchema");
      expect(output).toContain("CreateWorkOrderInput");
      expect(output).toContain("UpdateWorkOrderInput");
    });
  });
});
