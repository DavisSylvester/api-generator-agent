import type { IFeatureSpec, IEntitySpec, IFieldSpec } from "../core/interfaces/index.mts";

/**
 * Parse a PRD markdown document with checkboxes into feature specs.
 * Looks for patterns like:
 *   - [ ] Feature: Work Orders — CRUD for work orders with status transitions
 *   - [x] Feature: Users — User management with auth
 */
export function parsePrd(prdText: string): PrdParseResult {
  const features: IFeatureSpec[] = [];
  const completedFeatures: string[] = [];
  const pendingFeatures: string[] = [];

  const lines = prdText.split("\n");

  for (const line of lines) {
    const featureMatch = line.match(
      /^\s*-\s*\[([x ])\]\s*(?:Feature:\s*)?(.+?)(?:\s*[-:—]\s*(.+))?$/i,
    );

    if (featureMatch) {
      const isComplete = featureMatch[1] === "x";
      const name = (featureMatch[2] ?? "").trim();
      const description = (featureMatch[3] ?? name).trim();

      if (isComplete) {
        completedFeatures.push(name);
      } else {
        pendingFeatures.push(name);
      }

      const entity = buildEntityFromDescription(name, description);
      const domain = toKebabCase(name);

      features.push({
        name,
        domain,
        description,
        entities: [entity],
        dependsOn: [],
      });
    }
  }

  return {
    features,
    completedFeatures,
    pendingFeatures,
    projectName: extractProjectName(prdText),
  };
}

export interface PrdParseResult {
  features: IFeatureSpec[];
  completedFeatures: string[];
  pendingFeatures: string[];
  projectName: string;
}

function buildEntityFromDescription(name: string, description: string): IEntitySpec {
  const singular = name.replace(/s$/, "");
  const plural = singular.endsWith("s") ? `${singular}es` : `${singular}s`;

  const fields: IFieldSpec[] = [
    { name: "name", type: "string", required: true, description: "Name" },
    { name: "description", type: "string", required: false, description: "Description" },
  ];

  // Extract fields from description hints
  if (description.toLowerCase().includes("status")) {
    fields.push({
      name: "status",
      type: "string",
      required: true,
      description: "Current status",
    });
  }

  if (description.toLowerCase().includes("email")) {
    fields.push({
      name: "email",
      type: "email",
      required: true,
      description: "Email address",
    });
  }

  if (description.toLowerCase().includes("assign")) {
    fields.push({
      name: "assignedTo",
      type: "string",
      required: false,
      description: "Assigned user ID",
    });
  }

  if (description.toLowerCase().includes("priority")) {
    fields.push({
      name: "priority",
      type: "string",
      required: true,
      description: "Priority level",
    });
  }

  if (description.toLowerCase().includes("date") || description.toLowerCase().includes("due")) {
    fields.push({
      name: "dueDate",
      type: "datetime",
      required: false,
      description: "Due date",
    });
  }

  return {
    name: singular,
    pluralName: plural,
    fields,
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  };
}

function extractProjectName(prdText: string): string {
  // Look for "# Project: Name" or "# Name API" or first heading
  const titleMatch = prdText.match(/^#\s+(.+?)(?:\s*[-—]\s*.+)?$/m);
  if (titleMatch?.[1]) {
    return titleMatch[1].replace(/\s*(api|prd|product requirements document)/gi, "").trim();
  }
  return "my-project";
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
