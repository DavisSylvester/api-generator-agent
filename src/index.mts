import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadEnv } from './config/env.mts';
import { createContainer } from './container/di.mts';
import { runPipeline } from './orchestrator/pipeline.mts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
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
  // "-" means read from stdin
  if (input === '-') {
    const prdText = await readStdin();
    return { prdText, source: 'stdin' };
  }

  // Try as a file path first
  const resolvedPath = resolve(input);
  if (await isFile(resolvedPath)) {
    const prdText = await readFile(resolvedPath, 'utf-8');
    return { prdText, source: resolvedPath };
  }

  // Not a file — treat the input as raw PRD text
  return { prdText: input, source: 'inline text' };
}

interface CliFlags {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
  help: boolean;
  expand: boolean;
  noExpand: boolean;
  expandOnly: boolean;
}

function printUsage(): void {
  console.error('Usage: api-generator-agent [options] <prd-file-or-text> [max-iterations] [max-tasks]');
  console.error('');
  console.error('Arguments:');
  console.error('  prd-file-or-text  Path to a PRD file, raw PRD text, or "-" for stdin');
  console.error('  max-iterations    Max fix loop iterations (default: 5)');
  console.error('  max-tasks         Max tasks to run (default: all)');
  console.error('');
  console.error('Options:');
  console.error('  --dry-run         Show the task plan without executing');
  console.error('  --expand          Force PRD expansion even when input is a file or stdin');
  console.error('  --no-expand       Skip PRD expansion even when input is raw text');
  console.error('  --expand-only     Expand input into a PRD, save to disk, and exit 0');
  console.error('  --verbose         Enable debug-level logging');
  console.error('  --quiet           Only show warnings and errors');
  console.error('  -h, --help        Print this help and exit');
  console.error('');
  console.error('Expansion behavior:');
  console.error('  Raw text input (not a file, not stdin) is auto-expanded into a full PRD');
  console.error('  unless --no-expand is set. When running interactively, the expanded PRD');
  console.error('  is written to <workspace>/expanded-prds/expanded-<ts>.md and you are');
  console.error('  prompted to review (and optionally edit) before planning proceeds.');
  console.error('');
  console.error('Examples:');
  console.error('  api-generator-agent my-api-prd.md');
  console.error('  api-generator-agent --dry-run sample-prd.md');
  console.error('  api-generator-agent --expand-only "Build a notes API with auth and CRUD endpoints"');
  console.error('  api-generator-agent --no-expand "already-structured inline prd..."');
  console.error('  cat prd.md | api-generator-agent -');
}

function parseArgs(argv: string[]): { flags: CliFlags; positional: string[] } {
  const flags: CliFlags = {
    dryRun: false,
    verbose: false,
    quiet: false,
    help: false,
    expand: false,
    noExpand: false,
    expandOnly: false,
  };
  const positional: string[] = [];

  for (const arg of argv) {
    switch (arg) {
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--verbose':
        flags.verbose = true;
        break;
      case '--quiet':
        flags.quiet = true;
        break;
      case '--expand':
        flags.expand = true;
        break;
      case '--no-expand':
        flags.noExpand = true;
        break;
      case '--expand-only':
        flags.expandOnly = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') {
          console.error(`Unknown flag: ${arg}`);
          console.error('');
          printUsage();
          process.exit(2);
        }
        positional.push(arg);
    }
  }

  return { flags, positional };
}

async function promptForEnter(message: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  await rl.question(message);
  rl.close();
}

async function main(): Promise<void> {
  const { flags, positional } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  if (flags.expand && flags.noExpand) {
    console.error('Conflicting flags: --expand and --no-expand cannot both be set.');
    process.exit(2);
  }

  const prdInput = positional[0];
  const maxIterations = positional[1] ? parseInt(positional[1], 10) : undefined;
  const maxTasks = positional[2] ? parseInt(positional[2], 10) : undefined;

  if (!prdInput) {
    printUsage();
    process.exit(1);
  }

  const env = loadEnv();

  const container = createContainer(env);
  const { logger, pipelineConfig } = container;

  // Apply log level from CLI flags
  if (flags.verbose) {
    logger.level = 'debug';
  } else if (flags.quiet) {
    logger.level = 'warn';
  }

  let prdText: string;
  let source: string;
  try {
    const loaded = await loadPrd(prdInput);
    prdText = loaded.prdText;
    source = loaded.source;
    logger.info(`PRD loaded from ${source} (${prdText.length} chars)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`Failed to load PRD: ${msg}`);
    process.exit(1);
  }

  if (prdText.trim().length === 0) {
    logger.error('PRD input is empty');
    process.exit(1);
  }

  // Decide whether to run PRD expansion.
  // Rules:
  //   - --no-expand forces skip
  //   - --expand or --expand-only forces expansion
  //   - Otherwise: expand iff the input was raw inline text (not a file, not stdin)
  const shouldExpand = !flags.noExpand
    && (flags.expand || flags.expandOnly || source === 'inline text');

  if (shouldExpand) {
    const canPromptForConfirmation = Boolean(process.stdin.isTTY) && source !== 'stdin';
    if (!flags.expandOnly && !canPromptForConfirmation) {
      // Use console.error directly — winston's Console transport does not flush reliably
      // through non-TTY pipes, and this is the one message the subagent MUST see.
      console.error('Error: cannot prompt for PRD confirmation in a non-interactive environment.');
      console.error('');
      console.error('Use one of:');
      console.error('  --expand-only  Save the expanded PRD to disk and exit. Re-run with the saved file path after review.');
      console.error('  --no-expand    Skip PRD expansion and pass the raw text straight to planning.');
      process.exit(1);
    }

    logger.info('Phase 0: Expanding user prompt into a structured PRD');
    const expandResult = await container.prdExpansionAgent.run({
      runId: crypto.randomUUID(),
      payload: prdText,
      iteration: 0,
    });
    if (!expandResult.ok) {
      logger.error(`PRD expansion failed: ${expandResult.error.message}`);
      process.exit(1);
    }

    const expandedPrd = expandResult.value.payload;
    const prdDir = join(env.WORKSPACE_DIR, 'expanded-prds');
    await mkdir(prdDir, { recursive: true });
    const prdPath = join(prdDir, `expanded-${Date.now()}.md`);
    await writeFile(prdPath, expandedPrd, 'utf-8');
    logger.info(`Expanded PRD written to: ${prdPath}`);
    logger.info(`  ${expandedPrd.length} chars (tokens: ${expandResult.value.inputTokens} in / ${expandResult.value.outputTokens} out, ${expandResult.value.durationMs}ms)`);

    if (flags.expandOnly) {
      logger.info('--expand-only set — exiting without running the pipeline.');
      process.exit(0);
    }

    console.error('');
    console.error('Review the expanded PRD at:');
    console.error(`  ${prdPath}`);
    console.error('');
    console.error('Edit the file in-place if you want — your edits will be used.');
    await promptForEnter('Press Enter to proceed with planning + codegen, or Ctrl+C to cancel... ');

    // Re-read after confirmation so user edits are picked up.
    prdText = await readFile(prdPath, 'utf-8');
    logger.info(`Proceeding with PRD from ${prdPath} (${prdText.length} chars)`);
  }

  logger.info(`Config: maxIterations=${pipelineConfig.maxFixIterations}, concurrency=${pipelineConfig.maxConcurrency}`);
  logger.info(`LLM provider: ${pipelineConfig.llmProvider}${pipelineConfig.llmProviderHost ? ` (${pipelineConfig.llmProviderHost})` : ''}`);

  let effectiveConfig = maxIterations !== undefined && !isNaN(maxIterations)
    ? { ...pipelineConfig, maxFixIterations: maxIterations }
    : { ...pipelineConfig };

  if (maxTasks !== undefined && !isNaN(maxTasks)) {
    effectiveConfig = { ...effectiveConfig, maxTasks };
    logger.info(`Max tasks: ${maxTasks}`);
  }

  if (flags.dryRun) {
    logger.info('=== Dry Run Mode ===');
    logger.info('Planning only — no code generation or testing will be performed.');
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
      logger.info(`  [${task.type}] ${task.id} — "${task.name}" (depends: [${task.dependsOn.join(', ')}])`);
    }
    process.exit(0);
  }

  const result = await runPipeline(prdText, effectiveConfig, {
    planningAgent: container.planningAgent,
    codegenAgent: container.codegenAgent,
    eslintAgent: container.eslintAgent,
    qaAgent: container.qaAgent,
    documentationAgent: container.documentationAgent,
    logger,
    fallbackTiers: container.fallbackTiers,
    primaryFactory: container.primaryFactory,
    costTracker: container.costTracker,
  });

  if (!result.ok) {
    logger.error(`Pipeline failed: ${result.error.message}`);
    process.exit(1);
  }

  const pipeline = result.value;
  logger.info('=== Pipeline Results ===');
  logger.info(`Run ID: ${pipeline.runId}`);
  logger.info(`Duration: ${pipeline.durationMs}ms`);
  logger.info(`Documentation: ${pipeline.documentationGenerated ? 'generated' : 'not generated'}`);

  const completed = pipeline.taskStates.filter((s) => s.status === 'completed').length;
  const failed = pipeline.taskStates.filter((s) => s.status === 'failed').length;
  const skipped = pipeline.taskStates.filter((s) => s.status === 'skipped').length;

  logger.info(`Tasks: ${completed} completed, ${failed} failed, ${skipped} skipped`);

  for (const state of pipeline.taskStates) {
    const icon = state.status === 'completed' ? 'OK' : state.status === 'failed' ? 'FAIL' : 'SKIP';
    logger.info(`  [${icon}] ${state.taskId} (${state.iteration} iterations)${state.lastError ? ` — ${state.lastError}` : ''}`);
  }

  logger.info(`Workspace: .workspace/${pipeline.runId}/`);
  logger.info(`Report: .workspace/${pipeline.runId}/report.md`);

  // Cost summary
  const costSummary = container.costTracker.getSummary();
  logger.info(`=== Cost Summary ===`);
  logger.info(`LLM calls: ${costSummary.callCount}`);
  logger.info(`Tokens: ${costSummary.totalInputTokens.toLocaleString()} input, ${costSummary.totalOutputTokens.toLocaleString()} output`);
  logger.info(`Total cost: $${costSummary.totalCost.toFixed(4)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
