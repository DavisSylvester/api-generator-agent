import { describe, it, expect } from "bun:test";
import { renderService, renderServiceInterface, renderServiceBarrel } from "../../templates/base/service.tmpl.mts";
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

describe("service.tmpl", () => {
  describe("renderService", () => {
    it("should render a service class", () => {
      const output = renderService(sampleEntity, "work-orders");
      expect(output).toContain("export class WorkOrderService");
    });

    it("should inject repository and logger", () => {
      const output = renderService(sampleEntity, "work-orders");
      expect(output).toContain("constructor(repository: WorkOrderRepository, logger: Logger)");
    });

    it("should include CRUD methods", () => {
      const output = renderService(sampleEntity, "work-orders");
      expect(output).toContain("async create(");
      expect(output).toContain("async findById(");
      expect(output).toContain("async findAll(");
      expect(output).toContain("async update(");
      expect(output).toContain("async delete(");
    });

    it("should use Winston logger", () => {
      const output = renderService(sampleEntity, "work-orders");
      expect(output).toContain("this.logger.info");
    });
  });

  describe("renderServiceInterface", () => {
    it("should render a service interface", () => {
      const output = renderServiceInterface(sampleEntity, "work-orders");
      expect(output).toContain("export interface IWorkOrderService");
      expect(output).toContain("create(");
      expect(output).toContain("findById(");
      expect(output).toContain("findAll(");
      expect(output).toContain("update(");
      expect(output).toContain("delete(");
    });
  });

  describe("renderServiceBarrel", () => {
    it("should export service and interface", () => {
      const output = renderServiceBarrel(sampleEntity);
      expect(output).toContain("WorkOrderService");
      expect(output).toContain("IWorkOrderService");
      expect(output).toContain(".mjs");
    });
  });
});
