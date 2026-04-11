import type { IFeatureSpec } from "../core/interfaces/index.mts";
import type { Result } from "../types/result.mts";
import { ok, err } from "../types/result.mts";

/**
 * A node in the dependency graph representing a feature.
 */
export interface DependencyNode {
  name: string;
  feature: IFeatureSpec;
  dependsOn: string[];
}

/**
 * Result of dependency resolution: features in bottom-up order.
 */
export interface ResolvedDependencies {
  ordered: IFeatureSpec[];
  layers: IFeatureSpec[][];
}

/**
 * Resolve feature dependencies and return features in bottom-up order.
 * Features that have no dependencies come first (leaf nodes),
 * followed by features that depend on already-resolved features.
 *
 * Returns an error if a cycle is detected.
 */
export function resolveDependencies(
  features: IFeatureSpec[],
): Result<ResolvedDependencies, Error> {
  const nodes = buildNodes(features);
  const featureMap = new Map(features.map((f) => [f.name, f]));

  // Validate all dependency targets exist
  const validationError = validateDependencyTargets(nodes, featureMap);
  if (validationError) {
    return err(validationError);
  }

  // Detect cycles
  const cycleError = detectCycle(nodes);
  if (cycleError) {
    return err(cycleError);
  }

  // Topological sort using Kahn's algorithm for deterministic layering
  const sortResult = kahnSort(nodes);
  if (!sortResult.ok) {
    return sortResult;
  }

  const { ordered: orderedNames, layers: layeredNames } = sortResult.value;

  const ordered = orderedNames
    .map((name) => featureMap.get(name))
    .filter((f): f is IFeatureSpec => f !== undefined);

  const layers = layeredNames.map((layer) =>
    layer
      .map((name) => featureMap.get(name))
      .filter((f): f is IFeatureSpec => f !== undefined),
  );

  return ok({ ordered, layers });
}

/**
 * Wire up implicit dependencies based on entity relationships.
 * If feature A has an entity that references an entity in feature B,
 * then feature A depends on feature B.
 */
export function wireDependencies(
  features: IFeatureSpec[],
): IFeatureSpec[] {
  const entityToFeature = buildEntityFeatureMap(features);

  return features.map((feature) => {
    const implicitDeps = new Set(feature.dependsOn);

    for (const entity of feature.entities) {
      for (const rel of entity.relationships) {
        const depFeatureName = entityToFeature.get(
          rel.targetEntity.toLowerCase(),
        );
        if (depFeatureName && depFeatureName !== feature.name) {
          implicitDeps.add(depFeatureName);
        }
      }
    }

    return {
      ...feature,
      dependsOn: [...implicitDeps],
    };
  });
}

function buildNodes(features: IFeatureSpec[]): DependencyNode[] {
  return features.map((f) => ({
    name: f.name,
    feature: f,
    dependsOn: [...f.dependsOn],
  }));
}

function buildEntityFeatureMap(
  features: IFeatureSpec[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const feature of features) {
    for (const entity of feature.entities) {
      map.set(entity.name.toLowerCase(), feature.name);
    }
  }
  return map;
}

function validateDependencyTargets(
  nodes: DependencyNode[],
  featureMap: Map<string, IFeatureSpec>,
): Error | undefined {
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!featureMap.has(dep)) {
        return new Error(
          `Feature "${node.name}" depends on "${dep}" which does not exist`,
        );
      }
    }
  }
  return undefined;
}

function detectCycle(nodes: DependencyNode[]): Error | undefined {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));

  function dfs(name: string, path: string[]): Error | undefined {
    if (inStack.has(name)) {
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      return new Error(
        `Dependency cycle detected: ${cycle.join(" -> ")}`,
      );
    }
    if (visited.has(name)) {
      return undefined;
    }

    visited.add(name);
    inStack.add(name);

    const node = nodeMap.get(name);
    if (node) {
      for (const dep of node.dependsOn) {
        const cycleErr = dfs(dep, [...path, name]);
        if (cycleErr) {
          return cycleErr;
        }
      }
    }

    inStack.delete(name);
    return undefined;
  }

  for (const node of nodes) {
    const cycleErr = dfs(node.name, []);
    if (cycleErr) {
      return cycleErr;
    }
  }

  return undefined;
}

/**
 * Kahn's algorithm for topological sort with layer detection.
 * Nodes with the same in-degree level form a "layer" that can
 * be generated in parallel.
 */
function kahnSort(
  nodes: DependencyNode[],
): Result<{ ordered: string[]; layers: string[][] }, Error> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.name, 0);
    adjacency.set(node.name, []);
  }

  // Build adjacency (dependency -> dependents)
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const dependents = adjacency.get(dep) ?? [];
      dependents.push(node.name);
      adjacency.set(dep, dependents);
      inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1);
    }
  }

  const ordered: string[] = [];
  const layers: string[][] = [];

  // Start with nodes that have no dependencies
  let currentLayer = nodes
    .filter((n) => (inDegree.get(n.name) ?? 0) === 0)
    .map((n) => n.name)
    .sort();

  while (currentLayer.length > 0) {
    layers.push([...currentLayer]);
    ordered.push(...currentLayer);

    const nextLayer: string[] = [];

    for (const name of currentLayer) {
      const dependents = adjacency.get(name) ?? [];
      for (const dep of dependents) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          nextLayer.push(dep);
        }
      }
    }

    currentLayer = nextLayer.sort();
  }

  if (ordered.length !== nodes.length) {
    return err(
      new Error("Dependency resolution failed: not all features could be ordered"),
    );
  }

  return ok({ ordered, layers });
}
