import type { Logger } from 'winston';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Task, TaskState } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import type { FallbackTier } from '../config/fallback-tiers.mts';
import type { FixLoopDeps, FixLoopConfig } from './fix-loop.mts';
import { runFixLoop } from './fix-loop.mts';
import { CodegenAgent } from '../agents/codegen-agent.mts';
import type { CodegenInput, CodegenOutput } from '../agents/codegen-agent.mts';
import type { AgentInput, AgentOutput } from '../types/agent-context.mts';
import { streamInvoke } from '../llm/stream-invoke.mts';

const DIAGNOSTIC_ITERATIONS = 30;

const DIAGNOSTIC_SYSTEM_PROMPT = `You are an expert debugger analyzing why an API code generation task keeps failing.
You will be given:
1. The task description
2. The generated code
3. The test errors
4. The number of attempts already made

Analyze the root cause and provide a SPECIFIC fix. Output your fix as fenced code blocks with file paths.
You MUST output fenced code blocks. Do NOT write explanations without code.`;

export interface DiagnosticResult {
  readonly solved: boolean;
  readonly modelUsed?: string;
  readonly diagnosis?: string;
}

class FixedModelCodegenAgent extends CodegenAgent {

  private readonly fixedModel: BaseChatModel;
  private readonly fixedModelName: string;

  constructor(
    fixedModel: BaseChatModel,
    fixedModelName: string,
    llmFactory: any,
    logger: Logger,
    timeoutMs?: number,
  ) {
    super({ models: [fixedModelName], temperature: 0.2 }, llmFactory, logger, timeoutMs);
    this.fixedModel = fixedModel;
    this.fixedModelName = fixedModelName;
  }

  override async run(input: AgentInput<CodegenInput>): Promise<Result<AgentOutput<CodegenOutput>, Error>> {
    return this.runWithModel(input, this.fixedModel, this.fixedModelName);
  }
}

export async function runDiagnosticFix(
  task: Task,
  runId: string,
  deps: FixLoopDeps,
  fallbackTiers: readonly FallbackTier[],
  lastErrors: readonly string[],
  config: FixLoopConfig,
  logger: Logger,
): Promise<Result<TaskState, Error>> {
  logger.error(`[diagnostic] ╔══════════════════════════════════════════╗`);
  logger.error(`[diagnostic] ║  DIAGNOSTIC MODE: Task ${task.id}`);
  logger.error(`[diagnostic] ║  Collecting solutions from all models...`);
  logger.error(`[diagnostic] ╚══════════════════════════════════════════╝`);

  // Step 1: Collect diagnoses from all available models
  const diagnoses: { model: string; solution: string }[] = [];

  const diagnosticPrompt = [
    `Task: ${task.name} (${task.id})`,
    `Type: ${task.type}`,
    `Description: ${task.description}`,
    ``,
    `This task has failed ${lastErrors.length > 0 ? `with these errors` : `repeatedly`}:`,
    ...lastErrors.slice(0, 20).map((e, i) => `${i + 1}. ${e}`),
    ``,
    `All previous attempts (across multiple models and 50+ iterations) failed to fix this.`,
    `Analyze the ROOT CAUSE and provide a complete, working implementation as fenced code blocks.`,
  ].join(`\n`);

  for (const tier of fallbackTiers) {
    try {
      logger.info(`[diagnostic] Requesting diagnosis from ${tier.name}...`);
      const model = tier.createChatModel();
      const messages = [
        new SystemMessage(DIAGNOSTIC_SYSTEM_PROMPT),
        new HumanMessage(diagnosticPrompt),
      ];
      const response = await streamInvoke(model, messages, {});
      diagnoses.push({ model: tier.name, solution: response.substring(0, 5000) });
      logger.info(`[diagnostic] Got diagnosis from ${tier.name} (${response.length} chars)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[diagnostic] ${tier.name} diagnosis failed: ${msg}`);
    }
  }

  if (diagnoses.length === 0) {
    logger.error(`[diagnostic] No models could provide a diagnosis`);
    return hardFail(task, logger);
  }

  // Step 2: Log the diagnoses
  for (const d of diagnoses) {
    logger.info(`[diagnostic] === ${d.model} diagnosis (first 500 chars) ===`);
    logger.info(`[diagnostic] ${d.solution.substring(0, 500)}`);
  }

  // Step 3: Try each model with DIAGNOSTIC_ITERATIONS cycles
  for (const tier of fallbackTiers) {
    logger.info(`[diagnostic] ═══ Diagnostic fix attempt with ${tier.name} (${DIAGNOSTIC_ITERATIONS} iterations) ═══`);

    const chatModel = tier.createChatModel();
    const diagnosticAgent = new FixedModelCodegenAgent(
      chatModel,
      tier.model,
      deps.dummyFactory!,
      logger,
      600000,
    );

    const diagnosticDeps: FixLoopDeps = {
      ...deps,
      codegenAgent: diagnosticAgent as unknown as typeof deps.codegenAgent,
    };

    const diagnosticConfig: FixLoopConfig = {
      maxIterations: DIAGNOSTIC_ITERATIONS,
      integrationPort: config.integrationPort,
      systemPromptSuffix: `You MUST output fenced code blocks. Do NOT write explanations or analysis without code.\n\nDiagnostic context from other models:\n${diagnoses.map((d) => `[${d.model}]: ${d.solution.substring(0, 1000)}`).join(`\n\n`)}`,
    };

    const result = await runFixLoop(task, runId, diagnosticDeps, diagnosticConfig);

    if (result.ok && result.value.status === `completed`) {
      logger.info(`[diagnostic] ═══ Task ${task.id} SOLVED by ${tier.name} in diagnostic mode ═══`);
      return result;
    }

    const tierError = result.ok ? result.value.lastError : result.error.message;
    logger.warn(`[diagnostic] ${tier.name} diagnostic fix failed: ${tierError}`);
  }

  // All diagnostic attempts failed — hard fail
  return hardFail(task, logger);
}

function hardFail(task: Task, logger: Logger): Result<TaskState, Error> {
  logger.error(`[diagnostic] ╔══════════════════════════════════════════════════╗`);
  logger.error(`[diagnostic] ║  HARD FAILURE: Task ${task.id}`);
  logger.error(`[diagnostic] ║  All diagnostic attempts exhausted.`);
  logger.error(`[diagnostic] ║  This task needs human help to resolve.`);
  logger.error(`[diagnostic] ╚══════════════════════════════════════════════════╝`);

  return {
    ok: true,
    value: {
      taskId: task.id,
      status: `failed`,
      iteration: 0,
      lastError: `HARD FAILURE: All models and diagnostic attempts exhausted. This task needs human help to resolve.`,
      circuitBroken: true,
    },
  };
}
