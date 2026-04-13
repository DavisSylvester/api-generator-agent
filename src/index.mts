import { readFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Logger } from 'winston';
import { loadEnv, preflightLlmCheck } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { runPipeline } from './orchestrator/pipeline.mts';
import { parseArgs, printHelp } from './cli/parse-args.mts';
import { askYesNo, askChoice } from './cli/prompt.mts';
import type { IacProvider } from './cli/parse-args.mts';
import { listRuns } from './cli/list-runs.mts';
import { showStatus } from './cli/show-status.mts';

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.command === `help`) {
    printHelp();
    process.exit(0);
  }

  const env = loadEnv();

  if (options.command === `list-runs`) {
    await listRuns(env.WORKSPACE_DIR);
    process.exit(0);
  }

  if (options.command === `status`) {
    await showStatus(env.WORKSPACE_DIR, options.statusRunId!);
    process.exit(0);
  }

  // Preflight: verify the LLM provider is reachable before doing any real work
  await preflightLlmCheck(env);

  // Command is `run` — need either --prd or --resume
  const container = createContainer(env);
  const { logger, pipelineConfig } = container;

  // Build effective config from CLI flags + env defaults
  let effectiveConfig = { ...pipelineConfig };

  if (options.iterations !== undefined && !isNaN(options.iterations)) {
    effectiveConfig = { ...effectiveConfig, maxFixIterations: options.iterations };
  }

  if (options.maxTasks !== undefined && !isNaN(options.maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks: options.maxTasks };
    logger.info(`Max tasks: ${options.maxTasks}`);
  }

  if (options.concurrency !== undefined && !isNaN(options.concurrency)) {
    effectiveConfig = { ...effectiveConfig, maxConcurrency: options.concurrency };
  }

  // Diagrams: flag takes precedence, otherwise prompt
  if (options.diagrams === false) {
    effectiveConfig = { ...effectiveConfig, skipDiagrams: true };
  } else if (options.diagrams === true) {
    effectiveConfig = { ...effectiveConfig, skipDiagrams: false };
  } else {
    const wantDiagrams = await askYesNo(`Generate architecture diagrams?`, true);
    effectiveConfig = { ...effectiveConfig, skipDiagrams: !wantDiagrams };
  }

  if (options.noDocs) {
    effectiveConfig = { ...effectiveConfig, skipDocs: true };
  }

  if (options.noValidate) {
    effectiveConfig = { ...effectiveConfig, skipValidation: true };
  }

  if (options.resume) {
    effectiveConfig = { ...effectiveConfig, resumeRunId: options.resume };
  }

  // Load PRD text (required for new runs, optional for resume)
  let prdText = ``;
  if (options.prd) {
    const resolvedPath = resolve(options.prd);
    logger.info(`Reading PRD from: ${resolvedPath}`);
    try {
      prdText = await readFile(resolvedPath, 'utf-8');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to read PRD file: ${msg}`);
      process.exit(1);
    }
    logger.info(`PRD loaded (${prdText.length} chars)`);
  } else if (!options.resume) {
    logger.error(`No PRD file specified. Use --prd <file> or --resume <run-id>.`);
    process.exit(1);
  }

  logger.info(`Config: maxIterations=${effectiveConfig.maxFixIterations}, concurrency=${effectiveConfig.maxConcurrency}`);
  logger.info(`LLM provider: ${effectiveConfig.llmProvider}${effectiveConfig.llmProviderHost ? ` (${effectiveConfig.llmProviderHost})` : ``}`);

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
    notifier: container.notifier,
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
    logger.error(`\n${'='.repeat(60)}`);
    logger.error(`HARD FAILURE — ${hardFailures.length} task(s) need human help:`);
    for (const hf of hardFailures) {
      logger.error(`  - ${hf.taskId}: ${hf.lastError}`);
    }
    logger.error(`${'='.repeat(60)}`);
    process.exit(2);
  }

  const failed = result.value.taskStates.filter((s) => s.status === "failed").length;
  if (failed > 0) {
    process.exit(1);
  }

  // --- Copy output to target directory ---
  // Default: current directory (production). With --training: stays in .workspace/ only.
  const workspaceOutputDir = `${effectiveConfig.workspaceDir}/${result.value.runId}/output`;
  const effectiveOutput = options.output ?? (options.training ? undefined : `.`);

  if (effectiveOutput) {
    const dest = resolve(effectiveOutput);
    logger.info(`Copying generated project to ${dest}`);
    try {
      await mkdir(dest, { recursive: true });
      await cp(workspaceOutputDir, dest, { recursive: true });
      logger.info(`Generated project ready at ${dest}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to copy output to ${dest}: ${msg}`);
    }
  }

  const outputDir = effectiveOutput ? resolve(effectiveOutput) : workspaceOutputDir;

  // --- Post-success prompts: UI and IaC ---
  // Only reached when every task passed (no failures, no hard failures).

  // UI generation
  const wantUi = options.ui === true
    ? true
    : options.ui === false
      ? false
      : await askYesNo(`Generate a frontend UI for this API?`, false);

  if (wantUi) {
    logger.info(`UI generation requested — output will be at ${outputDir}/ui`);
    // TODO: invoke UI generation agent (e.g. angular-ui)
    logger.info(`UI generation is not yet implemented. Skipping.`);
  }

  // IaC generation
  let iacProvider: IacProvider | undefined;

  if (typeof options.iac === `string`) {
    // Flag specified a provider directly
    iacProvider = options.iac;
  } else if (options.iac === false) {
    // Explicitly skipped
    iacProvider = undefined;
  } else {
    // Prompt the user to pick a provider or skip
    iacProvider = await askChoice<IacProvider>(
      `Generate infrastructure-as-code (IaC) for deployment?`,
      [
        { label: `AWS CDK`, value: `cdk` },
        { label: `Terraform`, value: `terraform` },
      ],
    );
  }

  if (iacProvider) {
    logger.info(`IaC generation requested (${iacProvider}) — output will be at ${outputDir}/infra`);
    // TODO: invoke IaC generation for the selected provider
    logger.info(`IaC generation (${iacProvider}) is not yet implemented. Skipping.`);
  }
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
    const errorSuffix = state.lastError ? ` — ${state.lastError}` : "";
    logger.info(
      `  [${icon}] ${state.taskId} (${state.iteration} iterations)${errorSuffix}`,
    );
  }

  logger.info(`Workspace: .workspace/${pipeline.runId}/`);

  if (failed > 0) {
    const completedIds = pipeline.taskStates.filter((s) => s.status === `completed`).map((s) => s.taskId);
    if (completedIds.length > 0) {
      logger.info(`Resume with: bun run src/index.mts --resume ${pipeline.runId}`);
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Unhandled error: ${msg}\n`);
  process.exit(1);
});
