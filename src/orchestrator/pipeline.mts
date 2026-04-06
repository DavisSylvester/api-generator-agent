import type { Logger } from 'winston';
import type { TaskGraph, TaskState } from '../types/task.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { PipelineConfig, PipelineResult } from '../types/pipeline.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import { Workspace } from '../io/workspace.mts';
import { writeJson, readAllCodeFiles } from '../io/file-protocol.mts';
import { validateGraph } from '../graph/task-graph.mts';
import { executeGraph } from '../graph/parallel-executor.mts';
import { runFixLoop } from './fix-loop.mts';
import type { PlanningAgent } from '../agents/planning-agent.mts';
import type { CodegenAgent } from '../agents/codegen-agent.mts';
import type { EslintAgent } from '../agents/eslint-agent.mts';
import type { QaAgent } from '../agents/qa-agent.mts';
import type { DocumentationAgent } from '../agents/documentation-agent.mts';

export interface PipelineDeps {
  readonly planningAgent: PlanningAgent;
  readonly codegenAgent: CodegenAgent;
  readonly eslintAgent: EslintAgent;
  readonly qaAgent: QaAgent;
  readonly documentationAgent: DocumentationAgent;
  readonly logger: Logger;
}

export async function runPipeline(
  prdText: string,
  config: PipelineConfig,
  deps: PipelineDeps,
): Promise<Result<PipelineResult, Error>> {
  const startMs = performance.now();
  const runId = crypto.randomUUID();
  const { logger } = deps;

  logger.info(`Starting pipeline run: ${runId}`);

  // Phase 1: Create workspace
  const workspace = new Workspace(config.workspaceDir, runId);
  await workspace.init();

  // Phase 2: Planning
  logger.info('Phase 1: Planning — generating task graph from PRD');
  const planInput: AgentInput<string> = {
    runId,
    payload: prdText,
    iteration: 0,
  };

  const planResult = await deps.planningAgent.run(planInput);
  if (!planResult.ok) {
    return err(new Error(`Planning failed: ${planResult.error.message}`));
  }

  const taskGraph: TaskGraph = planResult.value.payload;
  logger.info(`Planning complete: ${taskGraph.tasks.length} tasks generated`);

  // Validate DAG
  const validation = validateGraph(taskGraph);
  if (!validation.ok) {
    return err(new Error(`Invalid task graph: ${validation.error.message}`));
  }

  // Write plan
  const planWriteResult = await writeJson(workspace.planPath(), taskGraph);
  if (!planWriteResult.ok) {
    return err(planWriteResult.error);
  }

  // Phase 3: Execute tasks
  logger.info('Phase 2: Executing task graph');
  const taskStates = await executeGraph(
    taskGraph,
    async (task) => runFixLoop(task, runId, {
      codegenAgent: deps.codegenAgent,
      eslintAgent: deps.eslintAgent,
      qaAgent: deps.qaAgent,
      workspace,
      logger,
    }, { maxIterations: config.maxFixIterations }),
    { maxConcurrency: config.maxConcurrency },
    logger,
  );

  const completedCount = [...taskStates.values()].filter((s) => s.status === 'completed').length;
  logger.info(`Task execution complete: ${completedCount}/${taskGraph.tasks.length} tasks succeeded`);

  // Phase 4: Documentation
  logger.info('Phase 3: Generating documentation');
  let documentationGenerated = false;

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

  const durationMs = Math.round(performance.now() - startMs);
  const allStates = [...taskStates.values()];

  logger.info(`Pipeline complete in ${durationMs}ms`);

  return ok({
    runId,
    taskStates: allStates,
    documentationGenerated,
    durationMs,
  });
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
