import { describe, it, expect } from "bun:test";
import { renderRepository, renderRepositoryBarrel } from "../../templates/base/repository.tmpl.mts";
import type { IEntitySpec } from "../../src/core/interfaces/index.mts";

const sampleEntity: IEntitySpec = {
  name: "work-order",
  pluralName: "work-orders",
  fields: [
    { name: "title", type: "string", required: true },
    { name: "email", type: "email", required: true },
    { name: "status", type: "string", required: true },
  ],
  relationships: [],
  operations: ["create", "read", "update", "delete", "list"],
};

describe("repository.tmpl", () => {
  describe("renderRepository", () => {
    it("should render a repository class", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain("export class WorkOrderRepository");
    });

    it("should import ulid", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain('import { ulid } from "ulid"');
    });

    it("should use kebab-case collection name", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain('"work-orders"');
    });

    it("should include ensureIndexes method", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain("async ensureIndexes()");
    });

    it("should include CRUD methods", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain("async create(");
      expect(output).toContain("async findById(");
      expect(output).toContain("async findAll(");
      expect(output).toContain("async update(");
      expect(output).toContain("async delete(");
    });

    it("should use ulid for new entity IDs", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain("id: ulid()");
    });

    it("should index unique fields like email", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain("unique: true");
      expect(output).toContain("email: 1");
    });

    it("should import correct type paths with .mjs", () => {
      const output = renderRepository(sampleEntity, "work-orders");
      expect(output).toContain(".mjs");
    });
  });

  describe("renderRepositoryBarrel", () => {
    it("should export repository class", () => {
      const output = renderRepositoryBarrel(sampleEntity);
      expect(output).toContain("WorkOrderRepository");
      expect(output).toContain(".mjs");
    });
  });
});
