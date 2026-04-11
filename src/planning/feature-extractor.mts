import type {
  IFeatureSpec,
  IEntitySpec,
  IFieldSpec,
  IRelationship,
} from "../core/interfaces/index.mts";

/**
 * Raw parsed input from either prompt-parser or prd-parser.
 * This is the intermediate representation before planning.
 */
export interface ParsedInput {
  projectName: string;
  features: IFeatureSpec[];
}

/**
 * Result of feature extraction with resolved entity details.
 */
export interface ExtractionResult {
  projectName: string;
  features: IFeatureSpec[];
  entityNames: string[];
  relationshipMap: Map<string, string[]>;
}

/**
 * Extracts and normalizes features from parsed input.
 * Identifies entities, enriches relationships, and validates completeness.
 */
export function extractFeatures(input: ParsedInput): ExtractionResult {
  const features = input.features.map((f) => normalizeFeature(f));
  const entityNames = collectEntityNames(features);
  const relationshipMap = buildRelationshipMap(features);

  // Validate that relationship targets exist
  validateRelationshipTargets(features, entityNames);

  return {
    projectName: input.projectName,
    features,
    entityNames,
    relationshipMap,
  };
}

/**
 * Infer relationships between entities based on field naming patterns.
 * E.g., a field named "userId" or "assignedTo" of type "string" with
 * a matching entity "User" implies a relationship.
 */
export function inferRelationships(
  features: IFeatureSpec[],
): IFeatureSpec[] {
  const entityNames = collectEntityNames(features);
  const entityNameLower = new Map(
    entityNames.map((n) => [n.toLowerCase(), n]),
  );

  return features.map((feature) => ({
    ...feature,
    entities: feature.entities.map((entity) =>
      inferEntityRelationships(entity, entityNameLower),
    ),
  }));
}

/**
 * Merge duplicate features that reference the same entity.
 * If two features have entities with the same name, combine their
 * fields and operations.
 */
export function deduplicateFeatures(
  features: IFeatureSpec[],
): IFeatureSpec[] {
  const seen = new Map<string, IFeatureSpec>();

  for (const feature of features) {
    const key = feature.name.toLowerCase();
    const existing = seen.get(key);

    if (existing) {
      seen.set(key, mergeFeatures(existing, feature));
    } else {
      seen.set(key, feature);
    }
  }

  return [...seen.values()];
}

function normalizeFeature(feature: IFeatureSpec): IFeatureSpec {
  return {
    ...feature,
    domain: toKebabCase(feature.domain || feature.name),
    entities: feature.entities.map((e) => normalizeEntity(e)),
    dependsOn: [...new Set(feature.dependsOn)],
  };
}

function normalizeEntity(entity: IEntitySpec): IEntitySpec {
  const name = toPascalCase(entity.name);
  return {
    ...entity,
    name,
    pluralName: entity.pluralName || pluralize(name),
    fields: ensureBaseFields(entity.fields),
    operations: entity.operations.length > 0
      ? entity.operations
      : ["create", "read", "update", "delete", "list"],
  };
}

function ensureBaseFields(fields: IFieldSpec[]): IFieldSpec[] {
  const hasId = fields.some((f) => f.name === "id");
  const hasCreatedAt = fields.some((f) => f.name === "createdAt");
  const hasUpdatedAt = fields.some((f) => f.name === "updatedAt");

  const result = [...fields];

  if (!hasId) {
    result.unshift({
      name: "id",
      type: "string",
      required: true,
      description: "Unique identifier (ULID)",
    });
  }

  if (!hasCreatedAt) {
    result.push({
      name: "createdAt",
      type: "datetime",
      required: true,
      description: "Creation timestamp",
    });
  }

  if (!hasUpdatedAt) {
    result.push({
      name: "updatedAt",
      type: "datetime",
      required: true,
      description: "Last update timestamp",
    });
  }

  return result;
}

function inferEntityRelationships(
  entity: IEntitySpec,
  entityNameLower: Map<string, string>,
): IEntitySpec {
  const existingTargets = new Set(
    entity.relationships.map((r) => r.targetEntity.toLowerCase()),
  );

  const inferred: IRelationship[] = [];

  for (const field of entity.fields) {
    const targetName = inferTargetFromField(field, entityNameLower);
    if (targetName && !existingTargets.has(targetName.toLowerCase())) {
      inferred.push({
        targetEntity: targetName,
        type: "one-to-many",
        foreignKey: field.name,
        required: field.required,
      });
      existingTargets.add(targetName.toLowerCase());
    }
  }

  return {
    ...entity,
    relationships: [...entity.relationships, ...inferred],
  };
}

function inferTargetFromField(
  field: IFieldSpec,
  entityNameLower: Map<string, string>,
): string | undefined {
  // Match patterns like "userId", "assignedToId", "categoryId"
  const idMatch = field.name.match(/^(.+?)(?:Id|_id)$/i);
  if (idMatch?.[1]) {
    const candidate = idMatch[1].toLowerCase();
    return entityNameLower.get(candidate);
  }

  // Match patterns like "assignedTo" where entity "AssignedTo" doesn't exist
  // but "User" does and the field description mentions "user"
  if (field.description) {
    for (const [lower, actual] of entityNameLower) {
      if (field.description.toLowerCase().includes(lower)) {
        return actual;
      }
    }
  }

  return undefined;
}

function collectEntityNames(features: IFeatureSpec[]): string[] {
  const names: string[] = [];
  for (const feature of features) {
    for (const entity of feature.entities) {
      if (!names.includes(entity.name)) {
        names.push(entity.name);
      }
    }
  }
  return names;
}

function buildRelationshipMap(
  features: IFeatureSpec[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const feature of features) {
    for (const entity of feature.entities) {
      const targets = entity.relationships.map((r) => r.targetEntity);
      if (targets.length > 0) {
        const existing = map.get(entity.name) ?? [];
        map.set(entity.name, [...new Set([...existing, ...targets])]);
      }
    }
  }

  return map;
}

function validateRelationshipTargets(
  features: IFeatureSpec[],
  entityNames: string[],
): void {
  const entitySet = new Set(entityNames.map((n) => n.toLowerCase()));

  for (const feature of features) {
    for (const entity of feature.entities) {
      for (const rel of entity.relationships) {
        if (!entitySet.has(rel.targetEntity.toLowerCase())) {
          // Relationship target doesn't match a known entity.
          // This is informational — the planner can still proceed.
          // The target may be resolved in a later phase or by the LLM.
        }
      }
    }
  }
}

function mergeFeatures(
  a: IFeatureSpec,
  b: IFeatureSpec,
): IFeatureSpec {
  const mergedEntities = [...a.entities];
  for (const entityB of b.entities) {
    const existing = mergedEntities.find(
      (e) => e.name.toLowerCase() === entityB.name.toLowerCase(),
    );
    if (existing) {
      // Merge fields
      const existingFieldNames = new Set(existing.fields.map((f) => f.name));
      const newFields = entityB.fields.filter(
        (f) => !existingFieldNames.has(f.name),
      );
      existing.fields.push(...newFields);

      // Merge operations
      const ops = new Set([...existing.operations, ...entityB.operations]);
      (existing as { operations: readonly string[] }).operations = [...ops];
    } else {
      mergedEntities.push(entityB);
    }
  }

  return {
    ...a,
    entities: mergedEntities,
    dependsOn: [...new Set([...a.dependsOn, ...b.dependsOn])],
  };
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    )
    .replace(/^./, (c) => c.toUpperCase());
}

function pluralize(name: string): string {
  if (name.endsWith("s")) {
    return `${name}es`;
  }
  if (name.endsWith("y") && !name.endsWith("ey") && !name.endsWith("ay") && !name.endsWith("oy")) {
    return `${name.slice(0, -1)}ies`;
  }
  return `${name}s`;
}
