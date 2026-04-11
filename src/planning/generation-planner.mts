import type { Logger } from "winston";
import type {
  IFeatureSpec,
  IGenerationPlan,
  IGenerationStep,
} from "../core/interfaces/index.mts";
import type { ParsedInput, ExtractionResult } from "./feature-extractor.mts";
import { extractFeatures, inferRelationships, deduplicateFeatures } from "./feature-extractor.mts";
import { resolveDependencies, wireDependencies } from "./dependency-resolver.mts";
import type { Result } from "../types/result.mts";
import { ok, err } from "../types/result.mts";

/**
 * Layer ordering for step generation within each feature.
 * Each feature generates steps in this order.
 */
const STEP_LAYERS = [
  "interfaces",
  "schemas",
  "repository",
  "service",
  "router",
  "tests",
] as const;

type StepLayer = typeof STEP_LAYERS[number];

export interface PlannerConfig {
  projectName: string;
}

/**
 * Takes parsed features (from prompt-parser or prd-parser), resolves
 * dependencies between features, orders features for bottom-up
 * generation, and produces an IGenerationPlan.
 */
export class GenerationPlanner {

  private readonly logger: Logger;
  private readonly config: PlannerConfig;

  constructor(logger: Logger, config: PlannerConfig) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Create a full generation plan from parsed input.
   * Steps:
   * 1. Extract and normalize features
   * 2. Infer relationships from field names
   * 3. Deduplicate features
   * 4. Wire up implicit dependencies
   * 5. Resolve dependencies (topological sort)
   * 6. Generate ordered steps per feature
   */
  public createPlan(input: ParsedInput): Result<IGenerationPlan, Error> {
    this.logger.info(
      `[planner] Creating plan for "${input.projectName}" with ${input.features.length} features`,
    );

    // Step 1: Extract and normalize
    const extraction = extractFeatures(input);
    this.logExtraction(extraction);

    // Step 2: Infer relationships
    const withRelationships = inferRelationships(extraction.features);

    // Step 3: Deduplicate
    const deduplicated = deduplicateFeatures(withRelationships);
    this.logger.info(
      `[planner] After deduplication: ${deduplicated.length} features`,
    );

    // Step 4: Wire implicit dependencies
    const wired = wireDependencies(deduplicated);

    // Step 5: Resolve dependencies
    const resolved = resolveDependencies(wired);
    if (!resolved.ok) {
      this.logger.error(`[planner] Dependency resolution failed: ${resolved.error.message}`);
      return err(resolved.error);
    }

    this.logResolution(resolved.value.ordered, resolved.value.layers);

    // Step 6: Generate steps
    const steps = this.generateSteps(resolved.value.ordered);
    this.logger.info(`[planner] Generated ${steps.length} total steps`);

    const plan: IGenerationPlan = {
      projectName: this.config.projectName || input.projectName,
      features: resolved.value.ordered,
      steps,
      createdAt: new Date().toISOString(),
    };

    return ok(plan);
  }

  /**
   * Create a plan from pre-resolved features (already ordered).
   * Skips extraction, deduplication, and dependency resolution.
   * Useful when the caller has already done those steps.
   */
  public createPlanFromOrdered(
    features: IFeatureSpec[],
  ): IGenerationPlan {
    const steps = this.generateSteps(features);

    return {
      projectName: this.config.projectName,
      features,
      steps,
      createdAt: new Date().toISOString(),
    };
  }

  private generateSteps(
    orderedFeatures: IFeatureSpec[],
  ): IGenerationStep[] {
    const steps: IGenerationStep[] = [];
    let orderCounter = 0;

    for (const feature of orderedFeatures) {
      const featureSteps = this.generateFeatureSteps(
        feature,
        orderCounter,
      );
      steps.push(...featureSteps);
      orderCounter += featureSteps.length;
    }

    return steps;
  }

  private generateFeatureSteps(
    feature: IFeatureSpec,
    startOrder: number,
  ): IGenerationStep[] {
    const steps: IGenerationStep[] = [];

    for (let i = 0; i < STEP_LAYERS.length; i++) {
      const layer = STEP_LAYERS[i] as StepLayer;
      const stepName = `${feature.name}/${layer}`;

      // Each step depends on the previous step within the same feature
      const dependsOn: string[] = [];
      if (i > 0 && steps.length > 0) {
        const prevStep = steps[steps.length - 1];
        if (prevStep) {
          dependsOn.push(prevStep.stepName);
        }
      }

      // The first step of this feature depends on all steps of
      // dependency features (specifically their "tests" step as
      // a completion marker).
      if (i === 0) {
        for (const depName of feature.dependsOn) {
          dependsOn.push(`${depName}/tests`);
        }
      }

      steps.push({
        featureName: feature.name,
        stepName,
        order: startOrder + i,
        dependsOn,
      });
    }

    return steps;
  }

  private logExtraction(extraction: ExtractionResult): void {
    this.logger.info(
      `[planner] Extracted ${extraction.entityNames.length} entities: ${extraction.entityNames.join(", ")}`,
    );

    for (const [entity, targets] of extraction.relationshipMap) {
      this.logger.info(
        `[planner]   ${entity} -> ${targets.join(", ")}`,
      );
    }
  }

  private logResolution(
    ordered: IFeatureSpec[],
    layers: IFeatureSpec[][],
  ): void {
    this.logger.info(
      `[planner] Resolved order: ${ordered.map((f) => f.name).join(" -> ")}`,
    );
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (layer) {
        this.logger.info(
          `[planner]   Layer ${i}: ${layer.map((f) => f.name).join(", ")}`,
        );
      }
    }
  }
}
