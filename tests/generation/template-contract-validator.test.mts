import { describe, it, expect } from "bun:test";
import {
  validateTemplateContract,
  isValidTemplate,
} from "../../src/generation/template-contract-validator.mts";
import { TEMPLATE_TYPE } from "../../src/core/enums/index.mts";

describe("TemplateContractValidator", () => {
  describe("validateTemplateContract", () => {
    it("should validate a conforming template as valid", () => {
      const validTemplate = {
        name: "test-template",
        type: TEMPLATE_TYPE.ADDON,
        description: "A test template",
        plan: (): unknown[] => [],
        render: (): unknown[] => [],
        validate: (): unknown => ({ valid: true, errors: [] }),
      };

      const result = validateTemplateContract(validTemplate, "/test/path");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.templateName).toBe("test-template");
    });

    it("should reject null candidate", () => {
      const result = validateTemplateContract(null, "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Template export is null or undefined");
    });

    it("should reject undefined candidate", () => {
      const result = validateTemplateContract(undefined, "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Template export is null or undefined");
    });

    it("should reject non-object candidate", () => {
      const result = validateTemplateContract("string-value", "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not an object");
    });

    it("should report missing required string properties", () => {
      const result = validateTemplateContract({}, "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required property: name");
      expect(result.errors).toContain("Missing required property: type");
      expect(result.errors).toContain("Missing required property: description");
    });

    it("should report missing required methods", () => {
      const result = validateTemplateContract({
        name: "test",
        type: "addon",
        description: "test",
      }, "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required method: plan()");
      expect(result.errors).toContain("Missing required method: render()");
      expect(result.errors).toContain("Missing required method: validate()");
    });

    it("should report wrong types for properties", () => {
      const result = validateTemplateContract({
        name: 123,
        type: true,
        description: [],
        plan: "not-a-function",
        render: 42,
        validate: {},
      }, "/test/path");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    });

    it("should warn about empty description", () => {
      const template = {
        name: "test",
        type: "addon",
        description: "",
        plan: (): unknown[] => [],
        render: (): unknown[] => [],
        validate: (): unknown => ({ valid: true, errors: [] }),
      };

      const result = validateTemplateContract(template, "/test/path");
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Template description is empty");
    });

    it("should use source path as template name when name is not a string", () => {
      const result = validateTemplateContract({ name: 42 }, "/some/path/index.mts");
      expect(result.templateName).toBe("/some/path/index.mts");
    });
  });

  describe("isValidTemplate", () => {
    it("should return true for a valid template", () => {
      const template = {
        name: "test",
        type: "addon",
        description: "A test",
        plan: (): unknown[] => [],
        render: (): unknown[] => [],
        validate: (): unknown => ({ valid: true, errors: [] }),
      };

      expect(isValidTemplate(template)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isValidTemplate(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidTemplate(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isValidTemplate("test")).toBe(false);
    });

    it("should return false when missing name", () => {
      const template = {
        type: "addon",
        description: "test",
        plan: (): unknown[] => [],
        render: (): unknown[] => [],
        validate: (): unknown => ({ valid: true, errors: [] }),
      };
      expect(isValidTemplate(template)).toBe(false);
    });

    it("should return false when plan is not a function", () => {
      const template = {
        name: "test",
        type: "addon",
        description: "test",
        plan: "not-a-function",
        render: (): unknown[] => [],
        validate: (): unknown => ({ valid: true, errors: [] }),
      };
      expect(isValidTemplate(template)).toBe(false);
    });
  });
});
