import type { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import { z } from 'zod';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { TaskGraph, Task } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { OllamaFactory } from '../llm/ollama-factory.mts';
import { PLANNING_SYSTEM_PROMPT, createPlanningUserPrompt } from '../prompts/planning.mts';

const taskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()).default([]),
  type: z.enum(['setup', 'model', 'endpoint', 'middleware', 'service', 'repository']),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const planResponseSchema = z.object({
  tasks: z.array(taskSchema),
});

export class PlanningAgent extends BaseAgent<string, TaskGraph> {

  constructor(modelChain: ModelChainConfig, ollamaFactory: OllamaFactory, logger: Logger, timeoutMs?: number) {
    super('planning', modelChain, ollamaFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<string>,
    chatModel: ChatOllama,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<TaskGraph, Error>> {
    this.logger.info(`[planning] Generating task graph from PRD (${input.payload.length} chars)`);

    const messages = [
      new SystemMessage(PLANNING_SYSTEM_PROMPT),
      new HumanMessage(createPlanningUserPrompt(input.payload)),
    ];

    this.logger.info('[planning] Sending PRD to LLM for task decomposition');
    const response = await chatModel.invoke(messages, traceConfig);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    this.logger.debug(`[planning] LLM response received (${content.length} chars)`);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('[planning] No JSON object found in LLM response');
      return err(new Error('No JSON object found in planning response'));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      this.logger.warn('[planning] Failed to parse LLM response as JSON');
      return err(new Error('Failed to parse planning response as JSON'));
    }

    const validation = planResponseSchema.safeParse(parsed);
    if (!validation.success) {
      this.logger.warn(`[planning] Task graph validation failed: ${validation.error.message}`);
      return err(new Error(`Invalid task graph: ${validation.error.message}`));
    }

    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(input.payload);

    const taskGraph: TaskGraph = {
      runId: input.runId,
      prdHash: hasher.digest('hex'),
      tasks: validation.data.tasks as readonly Task[],
    };

    this.logger.info(`[planning] Task graph generated: ${taskGraph.tasks.length} tasks`);
    for (const task of taskGraph.tasks) {
      this.logger.info(`[planning]   - ${task.id} (${task.type}): ${task.name} [depends: ${task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'none'}]`);
    }

    return ok(taskGraph);
  }
}
