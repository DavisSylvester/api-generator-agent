import { z } from 'zod';
import type { PipelineStateType } from '../graph/state.mts';
import { MODEL_CHAINS } from '../config/models.mts';
import { invokeWithFallback } from '../llm/create-chat-model.mts';
import type { TaskGraph, Task } from '../types/task.mts';

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

const SYSTEM_PROMPT = `You are an expert software architect and project planner.
Analyze the PRD and break it down into discrete tasks for building an Elysia API with BunJS.

Task types: setup, model, repository, service, middleware, endpoint.
Architecture: strict TypeScript, .mts extensions, DI, repositories return Result<T,E>, TypeBox validation (@sinclair/typebox).

Respond with valid JSON: { "tasks": [{ "id", "name", "description", "dependsOn": [], "type", "metadata": {} }] }
Order by dependency. Use IDs like "setup-di", "model-user", "repo-user", "service-auth", "endpoint-users".`;

export async function planNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  console.log(`[plan-node] Starting task decomposition from PRD (${state.prdText.length} chars)`);
  const startMs = performance.now();
  const host = Bun.env['OLLAMA_HOST'] ?? 'http://192.168.128.230:11434';

  console.log(`[plan-node] Using Ollama at ${host} with planning model chain`);
  const result = await invokeWithFallback(
    host,
    MODEL_CHAINS.planning,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate a task breakdown for this PRD:\n\n${state.prdText}` },
    ],
    { agentRole: 'planning', runId: state.runId, tags: ['planning'] },
  );

  if (!result.ok) {
    console.error(`[plan-node] Planning failed: ${result.error.message}`);
    return { error: `Planning failed: ${result.error.message}` };
  }

  console.log(`[plan-node] Parsing task graph from LLM response`);
  const jsonMatch = result.value.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[plan-node] No JSON found in planning response');
    return { error: 'No JSON found in planning response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('[plan-node] Failed to parse planning JSON');
    return { error: 'Failed to parse planning JSON' };
  }

  const validation = planResponseSchema.safeParse(parsed);
  if (!validation.success) {
    console.error(`[plan-node] Task graph validation failed: ${validation.error.message}`);
    return { error: `Invalid task graph: ${validation.error.message}` };
  }

  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(state.prdText);

  const taskGraph: TaskGraph = {
    runId: state.runId,
    prdHash: hasher.digest('hex'),
    tasks: validation.data.tasks as readonly Task[],
  };

  const durationMs = Math.round(performance.now() - startMs);
  console.log(`[plan-node] Task graph generated in ${durationMs}ms — ${taskGraph.tasks.length} tasks:`);
  for (const task of taskGraph.tasks) {
    console.log(`[plan-node]   - ${task.id} (${task.type}): ${task.name} [deps: ${task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'none'}]`);
  }

  return { taskGraph };
}
