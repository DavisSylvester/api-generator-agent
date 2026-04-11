import { describe, it, expect } from "bun:test";
import {
  renderInterface,
  renderCreateDto,
  renderUpdateDto,
  renderInterfaceBarrel,
} from "../../templates/base/interface.tmpl.mts";
import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

const sampleEntity: IEntitySpec = {
  name: "work-order",
  pluralName: "work-orders",
  fields: [
    { name: "title", type: "string", required: true, description: "Title of the work order" },
    { name: "description", type: "string", required: false },
    { name: "priority", type: "string", required: true },
    { name: "assignedTo", type: "string", required: false },
    { name: "dueDate", type: "datetime", required: false },
    { name: "isUrgent", type: "boolean", required: true },
  ],
  relationships: [],
  operations: ["create", "read", "update", "delete", "list"],
};

describe("interface.tmpl", () => {
  describe("renderInterface", () => {
    it("should render a valid TypeScript interface", () => {
      const output = renderInterface(sampleEntity, "work-orders");
      expect(output).toContain("export interface IWorkOrder");
      expect(output).toContain("id: string;");
      expect(output).toContain("title: string;");
      expect(output).toContain("description?: string;");
      expect(output).toContain("priority: string;");
      expect(output).toContain("isUrgent: boolean;");
      expect(output).toContain("createdAt: string;");
      expect(output).toContain("updatedAt: string;");
    });

    it("should include field descriptions as JSDoc comments", () => {
      const output = renderInterface(sampleEntity, "work-orders");
      expect(output).toContain("/** Title of the work order */");
    });

    it("should mark optional fields with ?", () => {
      const output = renderInterface(sampleEntity, "work-orders");
      expect(output).toContain("description?: string;");
      expect(output).toContain("assignedTo?: string;");
      expect(output).toContain("dueDate?: string;");
    });
  });

  describe("renderCreateDto", () => {
    it("should render a create DTO without id, createdAt, updatedAt", () => {
      const output = renderCreateDto(sampleEntity, "work-orders");
      expect(output).toContain("ICreateWorkOrder");
      expect(output).not.toContain("id:");
      expect(output).not.toContain("createdAt:");
      expect(output).not.toContain("updatedAt:");
    });
  });

  describe("renderUpdateDto", () => {
    it("should render an update DTO with all fields optional", () => {
      const output = renderUpdateDto(sampleEntity, "work-orders");
      expect(output).toContain("IUpdateWorkOrder");
      expect(output).toContain("title?: string;");
      expect(output).toContain("priority?: string;");
    });
  });

  describe("renderInterfaceBarrel", () => {
    it("should export all three interfaces", () => {
      const output = renderInterfaceBarrel(sampleEntity);
      expect(output).toContain("IWorkOrder");
      expect(output).toContain("ICreateWorkOrder");
      expect(output).toContain("IUpdateWorkOrder");
      expect(output).toContain(".mjs");
    });
  });
});
