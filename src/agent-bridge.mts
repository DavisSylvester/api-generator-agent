/**
 * Claude Code custom agent bridge for agent-one.
 *
 * Entry point when invoked as a Claude Code custom agent.
 * Reads the user prompt from the agent invocation context,
 * delegates to the same core modules (planning, generation,
 * verification, state, trace), and reports progress through
 * console output (which Claude Code captures).
 *
 * Human review checkpoints are natural pauses in the conversation
 * using CallbackReviewGate.
 */

import winston from "winston";
import type { Logger } from "winston";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "./config/env.mts";
import { createContainer } from "./container/di.mts";
import { runPipeline } from "./orchestrator/pipeline.mts";
import {
  parseInput,
  runPlanning,
  formatPlan,
  getRunStatus,
  formatRunStatus,
  getResumableFeatures,
} from "./cli/run-orchestrator.mts";
import { CallbackReviewGate } from "./core/interfaces/i-review-gate-callback.mts";
import { REVIEW_DECISION } from "./core/interfaces/i-review-gate.mts";

/**
 * Options passed from the agent invocation context.
 */
export interface AgentBridgeOptions {
  prompt?: string;
  prdPath?: string;
  projectName?: string;
  runId?: string;
  maxIterations?: number;
  outputDir?: string;
  dryRun?: boolean;
}

function createAgentLogger(): Logger {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: "agent-one-bridge" },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.printf(({ timestamp, level, message }) => {
            return `[${String(timestamp)}] [${level}] ${String(message)}`;
          }),
        ),
      }),
    ],
  });
}

/**
 * Main entry point for the Claude Code agent bridge.
 * Called by Claude Code when the user invokes the agent-one custom agent.
 */
export async function runAgentBridge(
  options: AgentBridgeOptions,
): Promise<void> {
  const logger = createAgentLogger();

  logger.info("agent-one bridge started");

  try {
    if (options.runId) {
      await handleResumeFromBridge(options, logger);
    } else {
      await handleGenerateFromBridge(options, logger);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Agent bridge error: ${msg}`);
    throw e;
  }
}

async function handleGenerateFromBridge(
  options: AgentBridgeOptions,
  logger: Logger,
): Promise<void> {
  const projectName = options.projectName ?? "generated-api";
  const mode = options.prdPath ? "prd" : "prompt";

  // Parse input
  const input = await parseInput(
    {
      mode: mode as "prd" | "prompt",
      prdPath: options.prdPath,
      prompt: options.prompt,
      projectName,
    },
    logger,
  );

  // Run planning
  const planResult = runPlanning(
    input.features,
    input.projectName,
    logger,
  );

  // Display plan
  const planText = formatPlan(planResult.plan);
  logger.info("=== Generation Plan ===");
  logger.info(planText);

  // Dry run: display plan and return
  if (options.dryRun) {
    logger.info("=== Dry Run Complete ===");
    logger.info("No files were written.");
    return;
  }

  // Full generation
  const env = loadEnv();
  const container = createContainer(env);

  const outputDir = options.outputDir ?? container.pipelineConfig.workspaceDir;
  const maxIterations = options.maxIterations ?? container.pipelineConfig.maxFixIterations;

  // Read PRD text for pipeline
  let prdText: string;
  if (options.prdPath) {
    prdText = await readFile(resolve(options.prdPath), "utf-8");
  } else {
    prdText = options.prompt ?? "";
  }

  const effectiveConfig = {
    ...container.pipelineConfig,
    maxFixIterations: maxIterations,
    workspaceDir: outputDir,
  };

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger: container.logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
  });

  if (!result.ok) {
    logger.error(`Generation failed: ${result.error.message}`);
    throw new Error(result.error.message);
  }

  logBridgeResult(result.value, logger);
}

async function handleResumeFromBridge(
  options: AgentBridgeOptions,
  logger: Logger,
): Promise<void> {
  const env = loadEnv();
  const container = createContainer(env);
  const outputDir = options.outputDir ?? container.pipelineConfig.workspaceDir;
  const runId = options.runId as string;

  const status = await getRunStatus(runId, outputDir);
  const resumable = getResumableFeatures(status);

  if (resumable.length === 0) {
    logger.info(
      `Run ${runId}: all features are already complete or failed.`,
    );
    logger.info(formatRunStatus(status));
    return;
  }

  logger.info(
    `Resuming run ${runId}: ${resumable.length} features remaining`,
  );

  const planPath = `${outputDir}/${runId}/plan.json`;
  let planText: string;
  try {
    planText = await readFile(planPath, "utf-8");
  } catch {
    throw new Error(
      `Could not read plan from ${planPath}. The run may not exist or was corrupted.`,
    );
  }

  const maxIterations = options.maxIterations ?? container.pipelineConfig.maxFixIterations;
  const effectiveConfig = {
    ...container.pipelineConfig,
    maxFixIterations: maxIterations,
    workspaceDir: outputDir,
  };

  const result = await runPipeline(planText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger: container.logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
  });

  if (!result.ok) {
    logger.error(`Resume failed: ${result.error.message}`);
    throw new Error(result.error.message);
  }

  logBridgeResult(result.value, logger);
}

function logBridgeResult(
  pipeline: {
    runId: string;
    taskStates: readonly { taskId: string; status: string; iteration: number; lastError?: string }[];
    durationMs: number;
    documentationGenerated: boolean;
  },
  logger: Logger,
): void {
  logger.info("=== Generation Complete ===");
  logger.info(`Run ID: ${pipeline.runId}`);
  logger.info(`Duration: ${pipeline.durationMs}ms`);

  const completed = pipeline.taskStates.filter(
    (s) => s.status === "completed",
  ).length;
  const failed = pipeline.taskStates.filter(
    (s) => s.status === "failed",
  ).length;

  logger.info(`Completed: ${completed}/${pipeline.taskStates.length}`);

  if (failed > 0) {
    logger.info(`Failed: ${failed}`);
    for (const state of pipeline.taskStates) {
      if (state.status === "failed") {
        logger.info(`  [FAIL] ${state.taskId}: ${state.lastError ?? "unknown"}`);
      }
    }
  }
}

// When run directly (e.g., bun run src/agent-bridge.mts)
// parse options from process.argv
if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: AgentBridgeOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--prompt":
        options.prompt = nextArg;
        i++;
        break;
      case "--prd":
        options.prdPath = nextArg;
        i++;
        break;
      case "--project":
        options.projectName = nextArg;
        i++;
        break;
      case "--run-id":
        options.runId = nextArg;
        i++;
        break;
      case "--max-iterations":
        options.maxIterations = nextArg ? parseInt(nextArg, 10) : undefined;
        i++;
        break;
      case "--output":
        options.outputDir = nextArg;
        i++;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
    }
  }

  runAgentBridge(options).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`Agent bridge failed: ${msg}\n`);
    process.exit(1);
  });
}
