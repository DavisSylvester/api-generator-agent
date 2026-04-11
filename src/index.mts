/**
 * CLI entry point for agent-one.
 *
 * Supports commands: generate, resume, status, trace.
 * Uses the shared orchestrator from src/cli/run-orchestrator.mts
 * so that both CLI and agent-bridge share 100% of core logic.
 *
 * Legacy mode: positional args (bun run src/index.mts <prd> [max-iters])
 * also supported for backwards compatibility, with stdin and loadPrd support.
 */

import winston from "winston";
import type { Logger } from "winston";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "./config/env.mts";
import { createContainer } from "./container/di.mts";
import { runPipeline } from "./orchestrator/pipeline.mts";
import {
  parseArgs,
  getHelpText,
  CLI_COMMANDS,
} from "./cli/arg-parser.mts";
import type {
  ParsedGenerateArgs,
  ParsedResumeArgs,
  ParsedStatusArgs,
  ParsedTraceArgs,
} from "./cli/arg-parser.mts";
import {
  parseInput,
  runPlanning,
  formatPlan,
  getRunStatus,
  formatRunStatus,
  getResumableFeatures,
} from "./cli/run-orchestrator.mts";
import { buildSummaryFromEntries, renderSessionSummaryMarkdown } from "./trace/session-summary.mts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function isFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadPrd(input: string): Promise<{ prdText: string; source: string }> {
  if (input === "-") {
    const prdText = await readStdin();
    return { prdText, source: "stdin" };
  }

  const resolvedPath = resolve(input);
  if (await isFile(resolvedPath)) {
    const prdText = await readFile(resolvedPath, "utf-8");
    return { prdText, source: resolvedPath };
  }

  return { prdText: input, source: "inline text" };
}

interface LegacyCliFlags {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

function parseLegacyArgs(argv: string[]): { flags: LegacyCliFlags; positional: string[] } {
  const flags: LegacyCliFlags = { dryRun: false, verbose: false, quiet: false };
  const positional: string[] = [];

  for (const arg of argv) {
    switch (arg) {
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--verbose":
        flags.verbose = true;
        break;
      case "--quiet":
        flags.quiet = true;
        break;
      default:
        positional.push(arg);
    }
  }

  return { flags, positional };
}

function createLogger(): Logger {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service: "agent-one" },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${String(timestamp)} [${level}] ${String(message)}`;
          }),
        ),
      }),
    ],
  });
}

async function handleGenerate(
  args: ParsedGenerateArgs,
  logger: Logger,
): Promise<void> {
  const input = await parseInput(
    {
      mode: args.prdPath ? "prd" : "prompt",
      prdPath: args.prdPath,
      prompt: args.prompt,
      projectName: args.projectName,
    },
    logger,
  );

  const planResult = runPlanning(
    input.features,
    input.projectName,
    logger,
  );

  const planText = formatPlan(planResult.plan);
  logger.info("=== Generation Plan ===");
  logger.info(planText);

  if (args.dryRun) {
    logger.info("=== Dry Run Complete ===");
    logger.info("No files were written.");
    return;
  }

  const env = loadEnv();
  const container = createContainer(env);

  const outputDir = args.outputDir ?? container.pipelineConfig.workspaceDir;
  const maxIterations = args.maxIterations ?? container.pipelineConfig.maxFixIterations;

  let prdText: string;
  if (args.prdPath) {
    prdText = await readFile(resolve(args.prdPath), "utf-8");
  } else {
    prdText = args.prompt ?? "";
  }

  const effectiveConfig = {
    ...container.pipelineConfig,
    maxFixIterations: maxIterations,
    workspaceDir: outputDir,
  };

  logger.info(`Starting full generation: project="${args.projectName}"`);

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger: container.logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
    costTracker: container.costTracker,
  });

  if (!result.ok) {
    logger.error(`Generation failed: ${result.error.message}`);
    process.exit(1);
  }

  logPipelineResult(result.value, logger);

  const costSummary = container.costTracker.getSummary();
  logger.info("=== Cost Summary ===");
  logger.info(`LLM calls: ${costSummary.callCount}`);
  logger.info(`Tokens: ${costSummary.totalInputTokens.toLocaleString()} input, ${costSummary.totalOutputTokens.toLocaleString()} output`);
  logger.info(`Total cost: $${costSummary.totalCost.toFixed(4)}`);
}

async function handleResume(
  args: ParsedResumeArgs,
  logger: Logger,
): Promise<void> {
  const env = loadEnv();
  const container = createContainer(env);
  const outputDir = args.outputDir ?? container.pipelineConfig.workspaceDir;

  const status = await getRunStatus(args.runId, outputDir);
  const resumable = getResumableFeatures(status);

  if (resumable.length === 0) {
    logger.info(`Run ${args.runId}: all features are already complete or failed.`);
    logger.info(formatRunStatus(status));
    return;
  }

  logger.info(`Resuming run ${args.runId}: ${resumable.length} features remaining`);

  const planPath = `${outputDir}/${args.runId}/plan.json`;
  let planText: string;
  try {
    planText = await readFile(planPath, "utf-8");
  } catch {
    throw new Error(
      `Could not read plan from ${planPath}. The run may not exist or was corrupted.`,
    );
  }

  const maxIterations = args.maxIterations ?? container.pipelineConfig.maxFixIterations;
  const effectiveConfig = {
    ...container.pipelineConfig,
    maxFixIterations: maxIterations,
    workspaceDir: outputDir,
  };

  logger.info(`Resuming pipeline for run ${args.runId}`);

  const result = await runPipeline(planText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger: container.logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
    costTracker: container.costTracker,
  });

  if (!result.ok) {
    logger.error(`Resume failed: ${result.error.message}`);
    process.exit(1);
  }

  logPipelineResult(result.value, logger);
}

async function handleStatus(
  args: ParsedStatusArgs,
  logger: Logger,
): Promise<void> {
  const outputDir = args.outputDir ?? ".workspace";

  const status = await getRunStatus(args.runId, outputDir);
  const formatted = formatRunStatus(status);

  logger.info("=== Run Status ===");
  logger.info(formatted);
}

async function handleTrace(
  args: ParsedTraceArgs,
  logger: Logger,
): Promise<void> {
  const outputDir = args.outputDir ?? ".workspace";

  const tracePath = `${outputDir}/${args.runId}/execution-summary.json`;
  let traceText: string;
  try {
    traceText = await readFile(tracePath, "utf-8");
  } catch {
    throw new Error(
      `Trace data not found at ${tracePath}. Is "${args.runId}" a valid run ID?`,
    );
  }

  const traceData = JSON.parse(traceText) as Record<string, unknown>;
  const summary = buildSummaryFromEntries(args.runId, []);
  const markdown = renderSessionSummaryMarkdown(summary);

  logger.info("=== Trace Summary ===");
  logger.info(`Run ID: ${args.runId}`);
  logger.info(`Completed: ${String(traceData["completed"] ?? "unknown")}`);
  logger.info(`Failed: ${String(traceData["failed"] ?? "unknown")}`);
  logger.info(`Skipped: ${String(traceData["skipped"] ?? "unknown")}`);
  logger.info(markdown);
}

function logPipelineResult(
  pipeline: { runId: string; taskStates: readonly { taskId: string; status: string; iteration: number; lastError?: string }[]; durationMs: number; documentationGenerated: boolean },
  logger: Logger,
): void {
  logger.info("=== Pipeline Results ===");
  logger.info(`Run ID: ${pipeline.runId}`);
  logger.info(`Duration: ${pipeline.durationMs}ms`);
  logger.info(
    `Documentation: ${pipeline.documentationGenerated ? "generated" : "not generated"}`,
  );

  const completed = pipeline.taskStates.filter((s) => s.status === "completed").length;
  const failed = pipeline.taskStates.filter((s) => s.status === "failed").length;
  const skipped = pipeline.taskStates.filter((s) => s.status === "skipped").length;

  logger.info(
    `Tasks: ${completed} completed, ${failed} failed, ${skipped} skipped`,
  );

  for (const state of pipeline.taskStates) {
    const icon = state.status === "completed"
      ? "OK"
      : state.status === "failed"
        ? "FAIL"
        : "SKIP";
    const errorSuffix = state.lastError ? ` -- ${state.lastError}` : "";
    logger.info(
      `  [${icon}] ${state.taskId} (${state.iteration} iterations)${errorSuffix}`,
    );
  }

  logger.info(`Workspace: .workspace/${pipeline.runId}/`);
  logger.info(`Report: .workspace/${pipeline.runId}/report.md`);
}

async function main(): Promise<void> {
  const logger = createLogger();
  const argv = process.argv.slice(2);

  // Backwards compatibility: if first arg is a file path (no command),
  // treat it as legacy mode: bun run src/index.mts <prd-file> [max-iters]
  if (argv.length > 0 && argv[0] && !Object.values(CLI_COMMANDS).includes(argv[0] as typeof CLI_COMMANDS[keyof typeof CLI_COMMANDS]) && !argv[0].startsWith("--")) {
    await handleLegacyMode(argv, logger);
    return;
  }

  const parsed = parseArgs(argv);

  if (!parsed.ok) {
    if (parsed.error.message) {
      logger.error(parsed.error.message);
    }
    if (parsed.error.showHelp) {
      logger.info(getHelpText());
    }
    process.exit(1);
  }

  try {
    switch (parsed.value.command) {
      case CLI_COMMANDS.GENERATE:
        await handleGenerate(parsed.value, logger);
        break;
      case CLI_COMMANDS.RESUME:
        await handleResume(parsed.value, logger);
        break;
      case CLI_COMMANDS.STATUS:
        await handleStatus(parsed.value, logger);
        break;
      case CLI_COMMANDS.TRACE:
        await handleTrace(parsed.value, logger);
        break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Command failed: ${msg}`);
    process.exit(1);
  }
}

/**
 * Legacy mode: first arg is a PRD file path, second is max-iterations.
 * Preserves backwards compatibility with existing invocations.
 * Supports stdin ("-"), file paths, and inline text via loadPrd().
 */
async function handleLegacyMode(
  argv: string[],
  logger: Logger,
): Promise<void> {
  const { flags, positional } = parseLegacyArgs(argv);
  const prdInput = positional[0];
  const maxIterations = positional[1] ? parseInt(positional[1], 10) : undefined;
  const maxTasks = positional[2] ? parseInt(positional[2], 10) : undefined;

  if (!prdInput) {
    logger.error("Usage: bun run src/index.mts [options] <prd-file-or-text> [max-iterations] [max-tasks]");
    logger.error("");
    logger.error("Arguments:");
    logger.error("  prd-file-or-text  Path to a PRD file, raw PRD text, or \"-\" for stdin");
    logger.error("  max-iterations    Max fix loop iterations (default: 5)");
    logger.error("  max-tasks         Max tasks to run (default: all)");
    logger.error("");
    logger.error("Options:");
    logger.error("  --dry-run         Show the task plan without executing");
    logger.error("  --verbose         Enable debug-level logging");
    logger.error("  --quiet           Only show warnings and errors");
    process.exit(1);
  }

  logger.info("[legacy] Running in legacy mode (positional args)");

  const env = loadEnv();
  const container = createContainer(env);

  if (flags.verbose) {
    logger.level = "debug";
  } else if (flags.quiet) {
    logger.level = "warn";
  }

  let prdText: string;
  try {
    const loaded = await loadPrd(prdInput);
    prdText = loaded.prdText;
    logger.info(`PRD loaded from ${loaded.source} (${prdText.length} chars)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to load PRD: ${msg}`);
    process.exit(1);
  }

  if (prdText.trim().length === 0) {
    logger.error("PRD input is empty");
    process.exit(1);
  }

  logger.info(`Config: maxIterations=${container.pipelineConfig.maxFixIterations}, concurrency=${container.pipelineConfig.maxConcurrency}`);
  logger.info(`LLM provider: ${container.pipelineConfig.llmProvider}${container.pipelineConfig.llmProviderHost ? ` (${container.pipelineConfig.llmProviderHost})` : ""}`);

  let effectiveConfig = maxIterations !== undefined && !isNaN(maxIterations)
    ? { ...container.pipelineConfig, maxFixIterations: maxIterations }
    : { ...container.pipelineConfig };

  if (maxTasks !== undefined && !isNaN(maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks };
  }

  if (flags.dryRun) {
    logger.info("=== Dry Run Mode ===");
    logger.info("Planning only -- no code generation or testing will be performed.");
    const planResult = await container.planningAgent.run({
      runId: crypto.randomUUID(),
      payload: prdText,
      iteration: 0,
    });
    if (!planResult.ok) {
      logger.error(`Planning failed: ${planResult.error.message}`);
      process.exit(1);
    }
    const tasks = planResult.value.payload.tasks;
    logger.info(`Plan: ${tasks.length} tasks`);
    for (const task of tasks) {
      logger.info(`  [${task.type}] ${task.id} -- "${task.name}" (depends: [${task.dependsOn.join(", ")}])`);
    }
    process.exit(0);
  }

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger: container.logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
    costTracker: container.costTracker,
  });

  if (!result.ok) {
    logger.error(`Pipeline failed: ${result.error.message}`);
    process.exit(1);
  }

  logPipelineResult(result.value, logger);

  const costSummary = container.costTracker.getSummary();
  logger.info("=== Cost Summary ===");
  logger.info(`LLM calls: ${costSummary.callCount}`);
  logger.info(`Tokens: ${costSummary.totalInputTokens.toLocaleString()} input, ${costSummary.totalOutputTokens.toLocaleString()} output`);
  logger.info(`Total cost: $${costSummary.totalCost.toFixed(4)}`);

  const hardFailures = result.value.taskStates.filter((s) => s.lastError?.includes(`HARD FAILURE`));
  if (hardFailures.length > 0) {
    logger.error(`\n${'═'.repeat(60)}`);
    logger.error(`HARD FAILURE — ${hardFailures.length} task(s) need human help:`);
    for (const hf of hardFailures) {
      logger.error(`  - ${hf.taskId}: ${hf.lastError}`);
    }
    logger.error(`${'═'.repeat(60)}`);
    process.exit(2);
  }

  const failed = result.value.taskStates.filter((s) => s.status === "failed").length;
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Unhandled error: ${msg}\n`);
  process.exit(1);
});
