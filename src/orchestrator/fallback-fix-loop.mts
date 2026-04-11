import type { Logger } from 'winston';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Task, TaskState } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import type { AgentInput, AgentOutput } from '../types/agent-context.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import type { FallbackTier } from '../config/fallback-tiers.mts';
import { CodegenAgent } from '../agents/codegen-agent.mts';
import type { CodegenInput, CodegenOutput } from '../agents/codegen-agent.mts';
import { runFixLoop } from './fix-loop.mts';
import type { FixLoopDeps, FixLoopConfig } from './fix-loop.mts';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const MUST_OUTPUT_CODE_BLOCKS = `You MUST output fenced code blocks. Do NOT write explanations or analysis without code. Every response MUST contain at least one fenced code block with a file path.`;

export interface FallbackFixLoopConfig {
  readonly primaryConfig: FixLoopConfig;
  readonly fallbackTiers: readonly FallbackTier[];
}

class FixedModelCodegenAgent extends CodegenAgent {

  private readonly fixedModel: BaseChatModel;
  private readonly fixedModelName: string;

  constructor(
    fixedModel: BaseChatModel,
    fixedModelName: string,
    llmFactory: OllamaFactory,
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

export async function runFallbackFixLoop(
  task: Task,
  runId: string,
  deps: FixLoopDeps,
  config: FallbackFixLoopConfig,
): Promise<Result<TaskState, Error>> {
  const { logger } = deps;

  // Try primary model first (existing behavior)
  const primaryResult = await runFixLoop(task, runId, deps, config.primaryConfig);

  if (primaryResult.ok && primaryResult.value.status === `completed`) {
    return primaryResult;
  }

  // Primary failed — collect error context for fallback tiers
  const primaryError = primaryResult.ok ? primaryResult.value.lastError : primaryResult.error.message;
  logger.warn(`[fallback] Primary codegen failed for task ${task.id}: ${primaryError}`);

  // Read accumulated knowledge for this task
  let knowledgeContext = ``;
  try {
    const knowledgePath = `docs/knowledge-bases/${task.id}-knowledge.md`;
    knowledgeContext = await readFile(knowledgePath, `utf-8`);
  } catch {
    // No persistent knowledge base
  }

  // Try each fallback tier
  for (const tier of config.fallbackTiers) {
    logger.info(`[fallback] ═══ Escalating task ${task.id} to ${tier.name} (${tier.maxIterations} iterations) ═══`);

    const chatModel = tier.createChatModel();
    // FixedModelCodegenAgent needs an OllamaFactory for the BaseAgent constructor,
    // but it won't use it since run() is overridden to use the fixed model directly.
    // We pass a dummy factory — the localFactory from deps works fine.
    const fallbackAgent = new FixedModelCodegenAgent(
      chatModel,
      tier.model,
      deps.dummyFactory!,
      logger,
      600000, // 10 min timeout for fallback models
    );

    const fallbackDeps: FixLoopDeps = {
      ...deps,
      codegenAgent: fallbackAgent as unknown as typeof deps.codegenAgent,
    };

    const fallbackConfig: FixLoopConfig = {
      maxIterations: tier.maxIterations,
      integrationPort: config.primaryConfig.integrationPort,
      systemPromptSuffix: MUST_OUTPUT_CODE_BLOCKS,
    };

    const fallbackResult = await runFixLoop(task, runId, fallbackDeps, fallbackConfig);

    if (fallbackResult.ok && fallbackResult.value.status === `completed`) {
      logger.info(`[fallback] ═══ Task ${task.id} SUCCEEDED with ${tier.name} ═══`);
      return fallbackResult;
    }

    const tierError = fallbackResult.ok ? fallbackResult.value.lastError : fallbackResult.error.message;
    logger.warn(`[fallback] ${tier.name} also failed for task ${task.id}: ${tierError}`);
  }

  // All tiers exhausted — return primary result
  logger.error(`[fallback] All tiers exhausted for task ${task.id}`);
  return primaryResult;
}
