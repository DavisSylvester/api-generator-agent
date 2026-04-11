import type { ITemplate } from "../core/interfaces/index.mts";

export interface IContractValidationResult {
  valid: boolean;
  templateName: string;
  errors: string[];
  warnings: string[];
}

export function validateTemplateContract(
  candidate: unknown,
  sourcePath: string,
): IContractValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const templateName = extractTemplateName(candidate, sourcePath);

  if (candidate === null || candidate === undefined) {
    errors.push("Template export is null or undefined");
    return { valid: false, templateName, errors, warnings };
  }

  if (typeof candidate !== "object") {
    errors.push(`Template export is not an object (got ${typeof candidate})`);
    return { valid: false, templateName, errors, warnings };
  }

  const obj = candidate as Record<string, unknown>;

  validateStringProperty(obj, "name", errors);
  validateStringProperty(obj, "type", errors);
  validateStringProperty(obj, "description", errors);
  validateFunctionProperty(obj, "plan", errors);
  validateFunctionProperty(obj, "render", errors);
  validateFunctionProperty(obj, "validate", errors);

  if (typeof obj["description"] === "string" && obj["description"].length === 0) {
    warnings.push("Template description is empty");
  }

  return {
    valid: errors.length === 0,
    templateName,
    errors,
    warnings,
  };
}

export function isValidTemplate(candidate: unknown): candidate is ITemplate {
  if (candidate === null || candidate === undefined || typeof candidate !== "object") {
    return false;
  }

  const obj = candidate as Record<string, unknown>;

  return (
    typeof obj["name"] === "string" &&
    typeof obj["type"] === "string" &&
    typeof obj["description"] === "string" &&
    typeof obj["plan"] === "function" &&
    typeof obj["render"] === "function" &&
    typeof obj["validate"] === "function"
  );
}

function validateStringProperty(
  obj: Record<string, unknown>,
  prop: string,
  errors: string[],
): void {
  if (!(prop in obj)) {
    errors.push(`Missing required property: ${prop}`);
  } else if (typeof obj[prop] !== "string") {
    errors.push(`Property "${prop}" must be a string (got ${typeof obj[prop]})`);
  }
}

function validateFunctionProperty(
  obj: Record<string, unknown>,
  prop: string,
  errors: string[],
): void {
  if (!(prop in obj)) {
    errors.push(`Missing required method: ${prop}()`);
  } else if (typeof obj[prop] !== "function") {
    errors.push(`Property "${prop}" must be a function (got ${typeof obj[prop]})`);
  }
}

function extractTemplateName(candidate: unknown, sourcePath: string): string {
  if (
    candidate !== null &&
    candidate !== undefined &&
    typeof candidate === "object" &&
    typeof (candidate as Record<string, unknown>)["name"] === "string"
  ) {
    return (candidate as Record<string, unknown>)["name"] as string;
  }
  return sourcePath;
}
