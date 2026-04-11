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
    it("should render create and update TypeBox schemas", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("import { Type, Static } from \"@sinclair/typebox\"");
      expect(output).toContain("createWorkOrderSchema");
      expect(output).toContain("updateWorkOrderSchema");
    });

    it("should render correct TypeBox types for fields", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("Type.String()");
      expect(output).toContain("Type.String({ pattern:");
      expect(output).toContain("Type.Number()");
      expect(output).toContain("Type.Boolean()");
    });

    it("should render id param schema with string length constraints", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("workOrderIdParamSchema");
      expect(output).toContain("Type.String({ minLength: 26, maxLength: 26 })");
    });

    it("should render query schema with pagination", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("workOrderQuerySchema");
      expect(output).toContain("page:");
      expect(output).toContain("limit:");
    });

    it("should derive types with Static<typeof>", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).toContain("Static<typeof createWorkOrderSchema>");
      expect(output).toContain("Static<typeof updateWorkOrderSchema>");
    });

    it("should make optional fields optional in update schema", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      // All fields in update schema should have Type.Optional
      const updateSection = output.split("updateWorkOrderSchema")[1];
      expect(updateSection).toContain("Type.Optional(");
    });

    it("should NOT contain any Zod references", () => {
      const output = renderValidationSchema(sampleEntity, "work-orders");
      expect(output).not.toContain("from \"zod\"");
      expect(output).not.toContain("z.object");
      expect(output).not.toContain("z.string");
      expect(output).not.toContain("z.infer");
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
