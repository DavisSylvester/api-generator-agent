/**
 * Shared orchestration module used by both CLI (index.mts) and
 * the Claude Code agent bridge (agent-bridge.mts).
 *
 * Both entry points pass their respective I/O adapters but share
 * 100% of the core generation logic through this module.
 */

import type { Logger } from "winston";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { parsePrompt } from "../input/prompt-parser.mts";
import { parsePrd } from "../input/prd-parser.mts";
import type { PrdParseResult } from "../input/prd-parser.mts";
import { extractFeatures, inferRelationships, deduplicateFeatures } from "../planning/feature-extractor.mts";
import { resolveDependencies, wireDependencies } from "../planning/dependency-resolver.mts";
import type { ResolvedDependencies } from "../planning/dependency-resolver.mts";
import { GenerationPlanner } from "../planning/generation-planner.mts";
import type { IFeatureSpec, IGenerationPlan, IReviewGate } from "../core/index.mts";
import { REVIEW_DECISION } from "../core/index.mts";
import { FeaturesStore } from "../state/features-store.mts";
import type { IFeaturesJson, IFeatureState } from "../state/features-store.mts";

/** Input mode: either a PRD file path or a NL prompt string. */
export interface OrchestratorInput {
  mode: "prd" | "prompt";
  prdPath?: string;
  prompt?: string;
  projectName: string;
}

export interface OrchestratorConfig {
  maxIterations: number;
  outputDir: string;
  dryRun: boolean;
}

/** The plan produced by the planning phase. */
export interface GenerationPlanResult {
  plan: IGenerationPlan;
  features: IFeatureSpec[];
  resolvedOrder: ResolvedDependencies;
  runId: string;
}

/** Summary returned after a generation run completes. */
export interface RunSummary {
  runId: string;
  featuresCompleted: number;
  featuresFailed: number;
  featuresPending: number;
  durationMs: number;
  dryRun: boolean;
  outputDir: string;
}

/** Status of a single run as read from features.json. */
export interface RunStatus {
  runId: string;
  features: readonly IFeatureState[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Parse input (PRD or prompt) and produce feature specs.
 */
export async function parseInput(
  input: OrchestratorInput,
  logger: Logger,
): Promise<{ features: IFeatureSpec[]; projectName: string }> {
  if (input.mode === "prd" && input.prdPath) {
    const resolvedPath = resolve(input.prdPath);
    logger.info(`Reading PRD from: ${resolvedPath}`);

    const prdText = await readFile(resolvedPath, "utf-8");
    logger.info(`PRD loaded (${prdText.length} chars)`);

    const parsed: PrdParseResult = parsePrd(prdText);
    const projectName = input.projectName || parsed.projectName;

    return { features: parsed.features, projectName };
  }

  if (input.mode === "prompt" && input.prompt) {
    logger.info(`Parsing NL prompt (${input.prompt.length} chars)`);

    const features = parsePrompt(input.prompt);
    return { features, projectName: input.projectName };
  }

  throw new Error("Either --prd or --prompt must be provided.");
}

/**
 * Run the planning phase: extract, deduplicate, resolve dependencies,
 * and produce a generation plan. Returns the plan without writing files.
 */
export function runPlanning(
  features: IFeatureSpec[],
  projectName: string,
  logger: Logger,
): GenerationPlanResult {
  const runId = ulid();

  logger.info(`[orchestrator] Planning run ${runId}`);

  // Extract and normalize
  const extraction = extractFeatures({ projectName, features });
  logger.info(
    `[orchestrator] Extracted ${extraction.entityNames.length} entities`,
  );

  // Infer relationships
  const withRelationships = inferRelationships(extraction.features);

  // Deduplicate
  const deduplicated = deduplicateFeatures(withRelationships);
  logger.info(
    `[orchestrator] After dedup: ${deduplicated.length} features`,
  );

  // Wire implicit dependencies
  const wired = wireDependencies(deduplicated);

  // Resolve dependencies (topological sort)
  const resolved = resolveDependencies(wired);
  if (!resolved.ok) {
    throw new Error(
      `Dependency resolution failed: ${resolved.error.message}`,
    );
  }

  // Create generation plan
  const planner = new GenerationPlanner(logger, { projectName });
  const planResult = planner.createPlan({ projectName, features: wired });

  if (!planResult.ok) {
    throw new Error(
      `Plan creation failed: ${planResult.error.message}`,
    );
  }

  return {
    plan: planResult.value,
    features: resolved.value.ordered,
    resolvedOrder: resolved.value,
    runId,
  };
}

/**
 * Format a generation plan as a human-readable string
 * for display in CLI or agent output.
 */
export function formatPlan(plan: IGenerationPlan): string {
  const lines: string[] = [
    `Project: ${plan.projectName}`,
    `Features: ${plan.features.length}`,
    `Steps: ${plan.steps.length}`,
    `Created: ${plan.createdAt}`,
    "",
    "Feature Order:",
  ];

  for (let i = 0; i < plan.features.length; i++) {
    const feature = plan.features[i];
    if (!feature) continue;

    const deps = feature.dependsOn.length > 0
      ? ` (depends on: ${feature.dependsOn.join(", ")})`
      : "";
    lines.push(`  ${i + 1}. ${feature.name}${deps}`);

    for (const entity of feature.entities) {
      lines.push(`     Entity: ${entity.name}`);
      lines.push(`     Fields: ${entity.fields.map((f) => f.name).join(", ")}`);
      lines.push(`     Operations: ${entity.operations.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Steps:");
  for (const step of plan.steps) {
    const deps = step.dependsOn.length > 0
      ? ` (after: ${step.dependsOn.join(", ")})`
      : "";
    lines.push(`  [${step.order}] ${step.stepName}${deps}`);
  }

  return lines.join("\n");
}

/**
 * Read features.json for a given run ID and return status.
 */
export async function getRunStatus(
  runId: string,
  outputDir: string,
): Promise<RunStatus> {
  const filePath = `${outputDir}/${runId}/features.json`;
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(
      `features.json not found at ${filePath}. Is "${runId}" a valid run ID?`,
    );
  }

  const data = JSON.parse(raw) as IFeaturesJson;

  return {
    runId: data.runId,
    features: data.features,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Format run status for display.
 */
export function formatRunStatus(status: RunStatus): string {
  const lines: string[] = [
    `Run ID: ${status.runId}`,
    `Created: ${status.createdAt}`,
    `Updated: ${status.updatedAt}`,
    "",
    "Features:",
    "",
  ];

  const pending = status.features.filter((f) => f.status === "pending");
  const inProgress = status.features.filter((f) => f.status === "in-progress");
  const complete = status.features.filter((f) => f.status === "complete");
  const failed = status.features.filter((f) => f.status === "failed");

  lines.push(`  Complete:    ${complete.length}`);
  lines.push(`  Failed:      ${failed.length}`);
  lines.push(`  In Progress: ${inProgress.length}`);
  lines.push(`  Pending:     ${pending.length}`);
  lines.push(`  Total:       ${status.features.length}`);
  lines.push("");

  for (const f of status.features) {
    const icon = getStatusIcon(f.status);
    const detail = f.lastError ? ` -- ${f.lastError}` : "";
    const iter = f.iteration > 0 ? ` (${f.iteration} iterations)` : "";
    lines.push(`  [${icon}] ${f.name}${iter}${detail}`);
  }

  return lines.join("\n");
}

/**
 * Find features that need to be resumed (pending or in-progress).
 */
export function getResumableFeatures(
  status: RunStatus,
): readonly IFeatureState[] {
  return status.features.filter(
    (f) => f.status === "pending" || f.status === "in-progress",
  );
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "complete":
      return "DONE";
    case "failed":
      return "FAIL";
    case "in-progress":
      return "RUN";
    case "pending":
      return "PEND";
    default:
      return "????";
  }
}
