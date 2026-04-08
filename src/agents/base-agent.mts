import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Logger } from 'winston';
import type { AgentInput, AgentOutput } from '../types/agent-context.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { AgentRole, ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import { createTraceConfig } from '../llm/tracing.mts';
import { ThinkingSpinner } from '../llm/thinking-spinner.mts';
import { withTimeout, LlmTimeoutError } from '../llm/with-timeout.mts';

export abstract class BaseAgent<TIn, TOut> {

  protected readonly role: AgentRole;
  protected readonly modelChain: ModelChainConfig;
  protected readonly llmFactory: OllamaFactory;
  protected readonly logger: Logger;
  protected readonly timeoutMs: number;
  protected readonly useThinking: boolean;

  constructor(
    role: AgentRole,
    modelChain: ModelChainConfig,
    llmFactory: OllamaFactory,
    logger: Logger,
    timeoutMs: number = 1800000,
    useThinking: boolean = false,
  ) {
    this.role = role;
    this.modelChain = modelChain;
    this.llmFactory = llmFactory;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.useThinking = useThinking;
  }

  public async run(input: AgentInput<TIn>): Promise<Result<AgentOutput<TOut>, Error>> {
    const errors: string[] = [];

    for (const model of this.modelChain.models) {
      this.logger.info(`[${this.role}] Trying model: ${model} (thinking: ${this.useThinking})`);

      const chatModel = this.useThinking
        ? this.llmFactory.createWithThinking(model, this.modelChain.temperature)
        : this.llmFactory.create(model, this.modelChain.temperature);
      const traceConfig = createTraceConfig({
        runId: input.runId,
        agentRole: this.role,
        taskId: input.taskId,
        model,
        iteration: input.iteration,
      });

      const startMs = performance.now();
      const spinner = new ThinkingSpinner(`${this.role}:${model}`);
      spinner.start();

      try {
        this.logger.info(`[${this.role}] Timeout set to ${Math.round(this.timeoutMs / 1000)}s`);
        const result = await withTimeout(
          this.execute(input, chatModel, traceConfig),
          model,
          this.timeoutMs,
        );

        if (result.ok) {
          const durationMs = Math.round(performance.now() - startMs);
          spinner.stop(`Done — ${model}`);
          this.logger.info(`[${this.role}] Success with model ${model} (${durationMs}ms)`);

          return ok({
            runId: input.runId,
            taskId: input.taskId,
            payload: result.value,
            modelUsed: model,
            durationMs,
          });
        }

        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        spinner.stop(`Failed — ${model}: ${errorMsg}`);
        errors.push(`${model}: ${errorMsg}`);
        this.logger.warn(`[${this.role}] Model ${model} failed: ${errorMsg}`);
      } catch (e) {
        const isTimeout = e instanceof LlmTimeoutError;
        const errorMsg = e instanceof Error ? e.message : String(e);
        spinner.stop(isTimeout ? `TIMEOUT — ${model} (${Math.round(this.timeoutMs / 1000)}s limit)` : `Error — ${model}: ${errorMsg}`);
        errors.push(`${model}: ${errorMsg}`);
        this.logger.warn(`[${this.role}] Model ${model} ${isTimeout ? 'timed out' : 'threw'}: ${errorMsg}`);
        if (isTimeout) {
          this.logger.warn(`[${this.role}] Moving to next model in fallback chain`);
        }
      }
    }

    return err(new Error(
      `All models failed for ${this.role}:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    ));
  }

  protected abstract execute(
    input: AgentInput<TIn>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<TOut, Error>>;
}
