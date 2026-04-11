import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'winston';
import { z } from 'zod';
import { BaseAgent } from './base-agent.mts';
import type { AgentInput } from '../types/agent-context.mts';
import type { TaskGraph, Task } from '../types/task.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';
import type { ModelChainConfig } from '../config/models.mts';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';
import { PLANNING_SYSTEM_PROMPT, createPlanningUserPrompt } from '../prompts/planning.mts';
import { streamInvokeWithUsage } from '../llm/stream-invoke.mts';

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

  constructor(modelChain: ModelChainConfig, llmFactory: ILlmFactory, logger: Logger, timeoutMs?: number) {
    super('planning', modelChain, llmFactory, logger, timeoutMs);
  }

  protected async execute(
    input: AgentInput<string>,
    chatModel: BaseChatModel,
    traceConfig: Record<string, unknown>,
  ): Promise<Result<TaskGraph, Error>> {
    this.logger.info(`[planning] Generating task graph from PRD (${input.payload.length} chars)`);

    const messages = [
      new SystemMessage(PLANNING_SYSTEM_PROMPT),
      new HumanMessage(createPlanningUserPrompt(input.payload)),
    ];

    this.logger.info('[planning] Sending PRD to LLM for task decomposition (streaming)');
    const streamResult = await streamInvokeWithUsage(chatModel, messages, traceConfig);
    const content = streamResult.content;
    this._lastTokenUsage = { inputTokens: streamResult.inputTokens, outputTokens: streamResult.outputTokens };

    this.logger.debug(`[planning] LLM response received (${content.length} chars)`);

    // Strip markdown code fences if present (Claude wraps JSON in ```json ... ```)
    let cleanedContent = content;
    // Try greedy match for fenced blocks (handles large JSON that may contain nested backticks)
    const fencedJson = /```(?:json)?\s*\n([\s\S]+)```/.exec(content);
    if (fencedJson?.[1]) {
      cleanedContent = fencedJson[1].trim();
    }
    // Also try stripping fence markers directly if regex didn't match (e.g. no closing fence)
    if (cleanedContent.startsWith(`\`\`\``)) {
      cleanedContent = cleanedContent.replace(/^```(?:json)?\s*\n?/, ``).replace(/```\s*$/, ``).trim();
    }

    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn(`[planning] No JSON object found in LLM response`);
      this.logger.warn(`[planning] Response (first 500 chars): ${content.substring(0, 500)}`);
      return err(new Error(`No JSON object found in planning response`));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (firstError) {
      // Try to repair common JSON issues: control chars in strings, trailing commas
      try {
        const repaired = jsonMatch[0]
          .replace(/[\x00-\x1f]/g, (ch) => ch === `\n` ? `\\n` : ch === `\t` ? `\\t` : ch === `\r` ? `` : ` `)
          .replace(/,\s*([}\]])/g, `$1`);
        parsed = JSON.parse(repaired);
        this.logger.info(`[planning] JSON repaired successfully after initial parse failure`);
      } catch (repairError) {
        this.logger.warn(`[planning] Failed to parse LLM response as JSON: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
        this.logger.warn(`[planning] Extracted JSON (first 500 chars): ${jsonMatch[0].substring(0, 500)}`);
        return err(new Error(`Failed to parse planning response as JSON`));
      }
    }

    const validation = planResponseSchema.safeParse(parsed);
    if (!validation.success) {
      this.logger.warn(`[planning] Task graph validation failed: ${validation.error.message}`);
      return err(new Error(`Invalid task graph: ${validation.error.message}`));
    }

    // Post-check: verify exactly one task has dependsOn=[] and warn if it's not setup-foundation
    const rootTasks = validation.data.tasks.filter((t) => t.dependsOn.length === 0);
    if (rootTasks.length !== 1) {
      this.logger.warn(`[planning] Expected exactly 1 root task (dependsOn=[]), found ${rootTasks.length}: ${rootTasks.map((t) => t.id).join(`, `)}`);
    } else if (rootTasks[0]?.id !== `setup-foundation`) {
      this.logger.warn(`[planning] Root task id is "${rootTasks[0]?.id}" — expected "setup-foundation"`);
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
