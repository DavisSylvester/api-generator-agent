import winston from 'winston';
import type { Logger } from 'winston';
import type { Task, TaskGraph, TaskState } from '../types/task.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { PipelineConfig, PipelineResult } from '../types/pipeline.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { Workspace } from '../io/workspace.mts';
import { writeJson, readJson, readAllCodeFiles } from '../io/file-protocol.mts';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import type { CodeFile } from '../agents/codegen-agent.mts';
import { z } from 'zod';
import { dirname } from 'node:path';
import { validateGraph } from '../graph/task-graph.mts';
import { executeGraph } from '../graph/parallel-executor.mts';
import { runFixLoop } from './fix-loop.mts';
import { runFallbackFixLoop } from './fallback-fix-loop.mts';
import type { FallbackTier } from '../config/fallback-tiers.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import { tokenTracker } from '../llm/token-tracker.mts';
import type { Notifier } from '../notifications/notifier.mts';
import type { PlanningAgent } from '../agents/planning-agent.mts';
import type { CodegenAgent } from '../agents/codegen-agent.mts';
import type { EslintAgent } from '../agents/eslint-agent.mts';
import { QaAgent } from '../agents/qa-agent.mts';
import type { DocumentationAgent } from '../agents/documentation-agent.mts';

const cachedTaskGraphSchema = z.object({
  runId: z.string(),
  prdHash: z.string(),
  tasks: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    dependsOn: z.array(z.string()).default([]),
    type: z.enum(['setup', 'model', 'endpoint', 'middleware', 'service', 'repository']),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })),
});

export interface PipelineDeps {
  readonly planningAgent: PlanningAgent;
  readonly codegenAgent: CodegenAgent;
  readonly eslintAgent: EslintAgent;
  readonly qaAgent: QaAgent;
  readonly documentationAgent: DocumentationAgent;
  readonly logger: Logger;
  readonly fallbackTiers?: readonly FallbackTier[];
  readonly localFactory?: OllamaFactory;
  readonly notifier?: Notifier;
}

export async function runPipeline(
  prdText: string,
  config: PipelineConfig,
  deps: PipelineDeps,
): Promise<Result<PipelineResult, Error>> {
  const startMs = performance.now();
  const isResume = !!config.resumeRunId;
  const runId = config.resumeRunId ?? crypto.randomUUID();
  const { logger } = deps;

  logger.info(`${isResume ? `Resuming` : `Starting`} pipeline run: ${runId}`);

  // Phase 0: Create or resume workspace
  const workspace = new Workspace(config.workspaceDir, runId);
  let preCompletedMap: ReadonlyMap<string, TaskState> | undefined;

  if (isResume) {
    try {
      await workspace.initForResume();
    } catch {
      return err(new Error(`Cannot resume run ${runId} — workspace not found at ${workspace.root}`));
    }
    const completedIds = await workspace.loadCompletedTaskIds();
    if (completedIds.size > 0) {
      const map = new Map<string, TaskState>();
      for (const taskId of completedIds) {
        map.set(taskId, { taskId, status: `completed`, iteration: 0 });
      }
      preCompletedMap = map;
      logger.info(`[resume] Found ${completedIds.size} completed tasks to skip: ${[...completedIds].join(`, `)}`);
    } else {
      logger.info(`[resume] No completed tasks found — running all tasks`);
    }
  } else {
    await workspace.init();
  }

  // Add file transport so all logs are persisted to the workspace
  logger.add(new winston.transports.File({
    filename: workspace.runLogPath(),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
  }));

  logger.info(`Workspace: ${workspace.root}`);
  logger.info(`Run log: ${workspace.runLogPath()}`);
  logger.info(`Config: maxIterations=${config.maxFixIterations}, concurrency=${config.maxConcurrency}, integrationPort=${config.integrationPort}`);

  // Write pipeline config to workspace
  await writeJson(`${workspace.root}/config.json`, {
    runId,
    prdLength: prdText.length,
    maxFixIterations: config.maxFixIterations,
    maxConcurrency: config.maxConcurrency,
    maxTasks: config.maxTasks,
    integrationPort: config.integrationPort,
    startedAt: new Date().toISOString(),
    resumed: isResume,
  });

  // Phase 1: Planning (load from workspace on resume, or cache/generate)
  let taskGraph: TaskGraph | undefined;
  let planFromCache = false;

  if (isResume) {
    logger.info(`Phase 1: Loading plan from previous run`);
    const planResult = await readJson<unknown>(workspace.planPath());
    if (planResult.ok) {
      const validation = cachedTaskGraphSchema.safeParse(planResult.value);
      if (validation.success) {
        taskGraph = {
          runId,
          prdHash: validation.data.prdHash,
          tasks: validation.data.tasks as readonly Task[],
        };
        planFromCache = true;
        logger.info(`Loaded plan from previous run (${taskGraph.tasks.length} tasks)`);
      }
    }
    if (!taskGraph) {
      return err(new Error(`Cannot resume — plan.json missing or invalid in ${workspace.root}`));
    }
  } else {
    logger.info(`Phase 1: Planning — generating task graph from PRD`);

    const prdHasher = new Bun.CryptoHasher('sha256');
    prdHasher.update(prdText);
    const prdHash = prdHasher.digest('hex');
    const planCachePath = workspace.planCachePath(prdHash);

    // Check for cached plan
    const cachedResult = await readJson<unknown>(planCachePath);
    if (cachedResult.ok) {
      const validation = cachedTaskGraphSchema.safeParse(cachedResult.value);
      if (validation.success) {
        taskGraph = {
          runId,
          prdHash: validation.data.prdHash,
          tasks: validation.data.tasks as readonly Task[],
        };
        planFromCache = true;
        logger.info(`Using cached plan for PRD hash ${prdHash} (${taskGraph.tasks.length} tasks)`);
      } else {
        logger.warn(`Cached plan for PRD hash ${prdHash} failed validation — regenerating`);
      }
    } else {
      logger.info(`No cached plan found for PRD hash ${prdHash}, generating...`);
    }

    if (!taskGraph) {
      const planInput: AgentInput<string> = {
        runId,
        payload: prdText,
        iteration: 0,
      };

      const planResult = await deps.planningAgent.run(planInput);
      if (!planResult.ok) {
        return err(new Error(`Planning failed: ${planResult.error.message}`));
      }

      taskGraph = planResult.value.payload;
      const planDurationMs = Math.round(performance.now() - startMs);
      logger.info(`Planning complete: ${taskGraph.tasks.length} tasks generated in ${planDurationMs}ms (model: ${planResult.value.modelUsed})`);
    }

    // Cache the plan for future runs (skip if it came from cache)
    if (!planFromCache) {
      const prdHasher2 = new Bun.CryptoHasher('sha256');
      prdHasher2.update(prdText);
      const prdHash2 = prdHasher2.digest('hex');
      const planCachePath2 = workspace.planCachePath(prdHash2);
      await mkdir(dirname(planCachePath2), { recursive: true });
      const cacheWriteResult = await writeJson(planCachePath2, taskGraph);
      if (cacheWriteResult.ok) {
        logger.info(`Plan cached at ${planCachePath2}`);
      } else {
        logger.warn(`Failed to cache plan: ${cacheWriteResult.error.message}`);
      }
    }
  }

  // Log each task in the plan
  for (const task of taskGraph.tasks) {
    const skipTag = preCompletedMap?.has(task.id) ? ` [SKIP — completed]` : ``;
    logger.info(`  [plan] Task: ${task.id} — "${task.name}" (depends: [${task.dependsOn.join(', ')}])${skipTag}`);
  }

  // Trim to maxTasks if set
  if (config.maxTasks !== undefined && config.maxTasks > 0 && taskGraph.tasks.length > config.maxTasks) {
    const trimmed = taskGraph.tasks.slice(0, config.maxTasks);
    const trimmedIds = new Set(trimmed.map((t) => t.id));
    const filtered = trimmed.map((t) => ({
      ...t,
      dependsOn: t.dependsOn.filter((d) => trimmedIds.has(d)),
    }));
    taskGraph = { ...taskGraph, tasks: filtered };
    logger.info(`Trimmed task graph to first ${config.maxTasks} tasks`);
  }

  // Validate DAG
  const dagValidation = validateGraph(taskGraph);
  if (!dagValidation.ok) {
    return err(new Error(`Invalid task graph: ${dagValidation.error.message}`));
  }

  // Write plan
  const planWriteResult = await writeJson(workspace.planPath(), taskGraph);
  if (!planWriteResult.ok) {
    return err(planWriteResult.error);
  }

  // Phase 2: Execute tasks
  logger.info(`Phase 2: Executing task graph${preCompletedMap ? ` (${preCompletedMap.size} pre-completed)` : ``}`);

  // Start notifier status updates
  const notifier = deps.notifier;
  notifier?.start(taskGraph.tasks.length);

  const taskStates = await executeGraph(
    taskGraph,
    async (task) => {
      const taskIndex = taskGraph.tasks.indexOf(task);
      const taskPort = config.integrationPort + taskIndex;
      const fixDeps = {
        codegenAgent: deps.codegenAgent,
        eslintAgent: deps.eslintAgent,
        qaAgent: deps.qaAgent,
        workspace,
        logger,
        dummyFactory: deps.localFactory,
      };
      const fixConfig = { maxIterations: config.maxFixIterations, integrationPort: taskPort };

      await notifier?.notify({
        type: `task_started`,
        taskId: task.id,
        taskName: task.name,
        message: `Starting ${task.name}`,
        timestamp: new Date().toISOString(),
      });

      let result;
      // Use fallback system if tiers are configured, otherwise plain fix loop
      if (deps.fallbackTiers && deps.fallbackTiers.length > 0) {
        result = await runFallbackFixLoop(task, runId, fixDeps, {
          primaryConfig: fixConfig,
          fallbackTiers: deps.fallbackTiers,
        });
      } else {
        result = await runFixLoop(task, runId, fixDeps, fixConfig);
      }

      // Notify on result
      if (result.ok) {
        const state = result.value;
        if (state.status === `completed`) {
          await notifier?.notify({
            type: `task_passed`,
            taskId: task.id,
            taskName: task.name,
            message: `${task.name} passed`,
            iteration: state.iteration,
            timestamp: new Date().toISOString(),
          });
        } else if (state.lastError?.includes(`HARD FAILURE`)) {
          await notifier?.notify({
            type: `hard_failure`,
            taskId: task.id,
            taskName: task.name,
            message: state.lastError,
            timestamp: new Date().toISOString(),
          });
        } else {
          await notifier?.notify({
            type: `task_failed`,
            taskId: task.id,
            taskName: task.name,
            message: state.lastError ?? `Failed`,
            iteration: state.iteration,
            timestamp: new Date().toISOString(),
          });
        }
      }

      return result;
    },
    { maxConcurrency: config.maxConcurrency, preCompleted: preCompletedMap },
    logger,
  );

  const allStatesArr = [...taskStates.values()];
  const completedCount = allStatesArr.filter((s) => s.status === 'completed').length;
  const failedCount = allStatesArr.filter((s) => s.status === 'failed').length;
  const skippedCount = allStatesArr.filter((s) => s.status === 'skipped').length;
  const hardFailures = allStatesArr.filter((s) => s.lastError?.includes(`HARD FAILURE`));
  logger.info(`Task execution complete: ${completedCount} completed, ${failedCount} failed, ${skippedCount} skipped (of ${taskGraph.tasks.length})`);

  for (const state of allStatesArr) {
    const icon = state.status === 'completed' ? 'OK' : state.status === 'failed' ? 'FAIL' : 'SKIP';
    logger.info(`  [result] [${icon}] ${state.taskId} — ${state.iteration} iterations${state.lastError ? ` — ${state.lastError}` : ''}`);
  }

  // Hard failure check — if any task hit HARD FAILURE, log and exit with error
  if (hardFailures.length > 0) {
    for (const hf of hardFailures) {
      logger.error(`  [HARD FAILURE] ${hf.taskId}: ${hf.lastError}`);
    }
    logger.error(`Pipeline has ${hardFailures.length} HARD FAILURE(s) that need human help to resolve.`);
  }

  // Write execution summary
  await writeJson(`${workspace.root}/execution-summary.json`, {
    completedAt: new Date().toISOString(),
    completed: completedCount,
    failed: failedCount,
    skipped: skippedCount,
    tasks: allStatesArr,
  });

  // Phase 2.25: Assembly — wire endpoint plugins into src/index.mts
  logger.info(`Phase 2.25: Assembly — wiring endpoint plugins into index.mts`);
  await assembleEntryFile(workspace, taskGraph, taskStates, logger);

  // Phase 2.5: Integration Testing (post-task, per completed task)
  logger.info(`Phase 2.5: Integration testing for completed tasks`);
  const integrationResults: Record<string, { passed: boolean; errors: readonly string[] }> = {};

  const completedTasks = taskGraph.tasks.filter((t) => {
    const state = taskStates.get(t.id);
    return state?.status === `completed`;
  });

  for (const task of completedTasks) {
    const taskIndex = taskGraph.tasks.indexOf(task);
    const taskPort = config.integrationPort + taskIndex;
    const collectionPath = workspace.taskHoppscotchCollectionPath(task.id);

    // Check if collection file exists before attempting
    let collectionExists = false;
    try {
      await access(collectionPath);
      collectionExists = true;
    } catch {
      // No collection file — QA may not have run generate mode
    }

    if (!collectionExists) {
      logger.info(`  [integration] Skipping ${task.id} — no Hoppscotch collection found`);
      integrationResults[task.id] = { passed: true, errors: [`No collection file — skipped`] };
      continue;
    }

    const codeDir = workspace.taskCodeDir(task.id);
    const codeResult = await readAllCodeFiles(codeDir);
    if (!codeResult.ok) {
      logger.warn(`  [integration] Skipping ${task.id} — could not read code files`);
      integrationResults[task.id] = { passed: false, errors: [`Could not read code files`] };
      continue;
    }

    const codeFiles: CodeFile[] = Array.from(codeResult.value.entries()).map(([fileName, content]) => ({
      path: fileName,
      content,
    }));

    logger.info(`  [integration] Running integration tests for ${task.id} on port ${taskPort}`);
    const result = await deps.qaAgent.runIntegrationTests(codeFiles, codeDir, collectionPath, taskPort);
    integrationResults[task.id] = { passed: result.passed, errors: result.errors };

    if (result.passed) {
      logger.info(`  [integration] ${task.id}: PASS`);
    } else {
      logger.warn(`  [integration] ${task.id}: FAIL — ${result.errors.length} errors`);
    }
  }

  await writeJson(`${workspace.root}/integration-results.json`, integrationResults);

  // Phase 3: Documentation
  let documentationGenerated = false;

  if (config.skipDocs) {
    logger.info(`Phase 3: Documentation — skipped (--no-docs)`);
  } else {
    logger.info(`Phase 3: Generating documentation`);

  const allCode = await gatherAllCode(workspace, taskGraph);
  if (allCode) {
    const docInput: AgentInput<string> = {
      runId,
      payload: allCode,
      iteration: 0,
    };

    const docResult = await deps.documentationAgent.run(docInput);
    if (docResult.ok) {
      await writeJson(workspace.hoppscotchPath(), docResult.value.payload);
      documentationGenerated = true;
      logger.info('Documentation generated successfully');
    } else {
      logger.error(`Documentation generation failed: ${docResult.error.message}`);
    }
  }
  } // end skipDocs guard

  // Phase 4: Generate architecture diagrams via diagram-agent
  if (config.skipDiagrams) {
    logger.info(`Phase 4: Diagrams — skipped (--no-diagrams)`);
  } else {
  logger.info(`Phase 4: Generating architecture diagrams`);
  try {
    // Build a system description from the PRD + task results for the diagram agent
    const diagramInput = [
      `# System Architecture Description`,
      ``,
      `## PRD Summary`,
      prdText.substring(0, 3000),
      ``,
      `## Generated Components`,
      ...taskGraph.tasks.map((t) => `- **${t.name}** (${t.type}): ${t.description.substring(0, 100)}`),
      ``,
      `## Task Dependencies`,
      ...taskGraph.tasks.filter((t) => t.dependsOn.length > 0).map((t) => `- ${t.id} depends on: ${t.dependsOn.join(`, `)}`),
      ``,
      `## Technology Stack`,
      `- Runtime: BunJS`,
      `- Framework: Elysia`,
      `- Database: MongoDB (Docker)`,
      `- Auth: JWT via jose + Elysia .resolve() pattern`,
      `- Validation: TypeBox`,
      `- Testing: bun:test against real MongoDB`,
    ].join(`\n`);

    const diagramDescPath = `${workspace.root}/diagram-input.md`;
    const diagramOutputDir = `${workspace.outputDir()}/graphs`;
    await writeFile(diagramDescPath, diagramInput, `utf-8`);

    const DIAGRAM_AGENT_PATH = `C:/projects/davis/agents/diagram-agent/src/index.mts`;
    const diagramProc = Bun.spawn([`bun`, `run`, DIAGRAM_AGENT_PATH, diagramDescPath, diagramOutputDir], {
      stdout: `pipe`,
      stderr: `pipe`,
      env: { ...Bun.env },
      cwd: `C:/projects/davis/agents/diagram-agent`,
    });

    const [diagramStdout, diagramStderr] = await Promise.all([
      new Response(diagramProc.stdout).text(),
      new Response(diagramProc.stderr).text(),
    ]);
    const diagramExit = await diagramProc.exited;

    if (diagramExit === 0) {
      logger.info(`[pipeline] Architecture diagrams generated at ${diagramOutputDir}`);
    } else {
      logger.warn(`[pipeline] Diagram generation failed (exit ${diagramExit}): ${diagramStderr.substring(0, 500)}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[pipeline] Diagram generation skipped: ${msg}`);
  }
  } // end skipDiagrams guard

  // Clean up MongoDB Docker container
  try {
    await QaAgent.stopMongoDB(logger);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`[pipeline] MongoDB cleanup failed: ${msg}`);
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info(`Pipeline complete in ${durationMs}ms`);

  // Stop notifier and send final notification
  notifier?.stop();
  await notifier?.notify({
    type: `pipeline_complete`,
    message: `${completedCount}/${taskGraph.tasks.length} passed, ${failedCount} failed (${Math.round(durationMs / 1000)}s)`,
    passed: completedCount,
    failed: failedCount,
    total: taskGraph.tasks.length,
    durationMs,
    timestamp: new Date().toISOString(),
  });

  // Token usage summary
  const tokenUsage = tokenTracker.getCumulative();
  logger.info(`═══ TOKEN USAGE ═══`);
  logger.info(`  Prompt tokens:     ${tokenUsage.promptTokens.toLocaleString()}`);
  logger.info(`  Completion tokens: ${tokenUsage.completionTokens.toLocaleString()}`);
  logger.info(`  Total tokens:      ${tokenUsage.totalTokens.toLocaleString()}`);
  logger.info(`═══════════════════`);

  // Write token usage to disk
  await writeJson(`${workspace.root}/token-usage.json`, {
    cumulative: tokenUsage,
    history: tokenTracker.getHistory(),
  });

  // Write final pipeline result
  await writeJson(`${workspace.root}/pipeline-result.json`, {
    runId,
    durationMs,
    documentationGenerated,
    completedAt: new Date().toISOString(),
  });

  return ok({
    runId,
    taskStates: allStatesArr,
    documentationGenerated,
    durationMs,
  });
}

async function assembleEntryFile(
  workspace: Workspace,
  graph: TaskGraph,
  taskStates: Map<string, TaskState>,
  logger: Logger,
): Promise<void> {
  // Find the setup-foundation task and read its src/index.mts
  const setupTask = graph.tasks.find((t) => t.id === `setup-foundation`);
  if (!setupTask) {
    logger.warn(`[assembly] No setup-foundation task found — skipping assembly`);
    return;
  }

  const setupState = taskStates.get(`setup-foundation`);
  if (!setupState || (setupState.status !== `completed` && setupState.status !== `failed`)) {
    logger.warn(`[assembly] setup-foundation not completed/failed — skipping assembly`);
    return;
  }

  const setupCodeDir = workspace.taskCodeDir(`setup-foundation`);
  const indexPath = `${setupCodeDir}/src/index.mts`;
  let indexContent: string;
  try {
    indexContent = await readFile(indexPath, `utf-8`);
  } catch {
    logger.warn(`[assembly] Could not read ${indexPath} — skipping assembly`);
    return;
  }

  // Find all completed endpoint tasks
  const endpointTasks = graph.tasks.filter((t) => {
    const state = taskStates.get(t.id);
    return t.type === `endpoint` && state?.status === `completed`;
  });

  if (endpointTasks.length === 0) {
    logger.info(`[assembly] No completed endpoint tasks — writing index.mts as-is`);
    const assembledPath = `${workspace.docsDir()}/assembled-index.mts`;
    await writeFile(assembledPath, indexContent, `utf-8`);
    return;
  }

  // Scan endpoint task code dirs for files exporting Elysia plugins
  const plugins: Array<{ importPath: string; exportName: string }> = [];

  for (const task of endpointTasks) {
    const codeDir = workspace.taskCodeDir(task.id);
    const codeResult = await readAllCodeFiles(codeDir);
    if (!codeResult.ok) continue;

    for (const [fileName, content] of codeResult.value) {
      // Look for exported Elysia plugins: export const fooRoutes = new Elysia(
      const exportMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*new\s+Elysia\s*\(/g);
      for (const match of exportMatches) {
        const exportName = match[1];
        if (exportName) {
          // Build relative import path from src/index.mts to the plugin file
          const relPath = fileName.startsWith(`src/`)
            ? `./${fileName.slice(4).replace(/\.mts$/, `.mts`)}`
            : `./${fileName}`;
          plugins.push({ importPath: relPath, exportName });
          logger.info(`[assembly] Found plugin: ${exportName} in ${fileName}`);
        }
      }
    }
  }

  if (plugins.length === 0) {
    logger.info(`[assembly] No Elysia plugins found in endpoint tasks — writing index.mts as-is`);
    const assembledPath = `${workspace.docsDir()}/assembled-index.mts`;
    await writeFile(assembledPath, indexContent, `utf-8`);
    return;
  }

  // Generate import lines
  const importLines = plugins
    .map((p) => `import { ${p.exportName} } from '${p.importPath}'`)
    .join(`\n`);

  // Generate .use() calls
  const useLines = plugins
    .map((p) => `  .use(${p.exportName})`)
    .join(`\n`);

  // Insert imports at the top (after existing imports) and .use() before .listen()
  let assembled = indexContent;

  // Insert import lines after the last import statement
  const lastImportIdx = assembled.lastIndexOf(`import `);
  if (lastImportIdx !== -1) {
    const lineEnd = assembled.indexOf(`\n`, lastImportIdx);
    if (lineEnd !== -1) {
      assembled = assembled.slice(0, lineEnd + 1) + importLines + `\n` + assembled.slice(lineEnd + 1);
    }
  } else {
    // No imports found — prepend
    assembled = importLines + `\n` + assembled;
  }

  // Insert .use() calls before .listen()
  const listenIdx = assembled.indexOf(`.listen(`);
  if (listenIdx !== -1) {
    assembled = assembled.slice(0, listenIdx) + useLines + `\n  ` + assembled.slice(listenIdx);
  } else {
    // No .listen() found — append .use() calls at end
    assembled += `\n${useLines}\n`;
  }

  const assembledPath = `${workspace.docsDir()}/assembled-index.mts`;
  await writeFile(assembledPath, assembled, `utf-8`);
  logger.info(`[assembly] Assembled index.mts with ${plugins.length} plugin(s) written to ${assembledPath}`);
}

async function gatherAllCode(workspace: Workspace, graph: TaskGraph): Promise<string | undefined> {
  const parts: string[] = [];

  for (const task of graph.tasks) {
    const codeDir = workspace.taskCodeDir(task.id);
    const result = await readAllCodeFiles(codeDir);
    if (result.ok) {
      for (const [fileName, content] of result.value) {
        parts.push(`// ${task.id}/${fileName}\n${content}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}
