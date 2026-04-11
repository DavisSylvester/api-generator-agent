import type { IFeatureSpec, IEntitySpec, IFieldSpec } from "../core/interfaces/index.mts";

/**
 * Parse a natural language prompt to extract feature specs.
 * This is a simple heuristic parser for common patterns.
 * For complex prompts, the LLM-based planning agent is used instead.
 */
export function parsePrompt(prompt: string): IFeatureSpec[] {
  const features: IFeatureSpec[] = [];
  const entities = extractEntities(prompt);

  for (const entity of entities) {
    const domain = toKebabCase(entity.name);
    features.push({
      name: entity.name,
      domain,
      description: `CRUD operations for ${entity.name}`,
      entities: [entity],
      dependsOn: [],
    });
  }

  // Wire up dependencies based on relationships
  for (const feature of features) {
    for (const entity of feature.entities) {
      for (const rel of entity.relationships) {
        const depFeature = features.find((f) =>
          f.entities.some((e) => e.name.toLowerCase() === rel.targetEntity.toLowerCase()),
        );
        if (depFeature && !feature.dependsOn.includes(depFeature.name)) {
          feature.dependsOn.push(depFeature.name);
        }
      }
    }
  }

  return features;
}

function extractEntities(prompt: string): IEntitySpec[] {
  const entities: IEntitySpec[] = [];
  const words = prompt.split(/\s+/);

  // Look for patterns like "with X management" or "X CRUD" or "X API"
  const entityPatterns = [
    /(?:manage|track|handle)\s+(\w+)/gi,
    /(\w+)\s+(?:management|tracking|crud|api)/gi,
    /(?:create|build|generate)\s+(?:a\s+)?(\w+)/gi,
  ];

  const foundNames = new Set<string>();

  for (const pattern of entityPatterns) {
    let match;
    while ((match = pattern.exec(prompt)) !== null) {
      const name = match[1];
      if (name && !isStopWord(name) && !foundNames.has(name.toLowerCase())) {
        foundNames.add(name.toLowerCase());
        entities.push(buildDefaultEntity(name));
      }
    }
  }

  // If no entities found, extract nouns heuristically
  if (entities.length === 0) {
    const nounPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)*)\b/g;
    let match;
    while ((match = nounPattern.exec(prompt)) !== null) {
      const name = match[1];
      if (name && !isStopWord(name) && !foundNames.has(name.toLowerCase())) {
        foundNames.add(name.toLowerCase());
        entities.push(buildDefaultEntity(name));
      }
    }
  }

  return entities;
}

function buildDefaultEntity(name: string): IEntitySpec {
  const singular = name.replace(/s$/, "");
  const plural = singular.endsWith("s") ? `${singular}es` : `${singular}s`;

  return {
    name: singular,
    pluralName: plural,
    fields: buildDefaultFields(),
    relationships: [],
    operations: ["create", "read", "update", "delete", "list"],
  };
}

function buildDefaultFields(): IFieldSpec[] {
  return [
    { name: "name", type: "string", required: true, description: "Name" },
    { name: "description", type: "string", required: false, description: "Description" },
    { name: "status", type: "string", required: true, description: "Current status" },
  ];
}

function isStopWord(word: string): boolean {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "with", "for", "from", "to",
    "in", "on", "at", "by", "api", "crud", "management", "tracking",
    "create", "build", "generate", "new", "system", "application",
  ]);
  return stopWords.has(word.toLowerCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
