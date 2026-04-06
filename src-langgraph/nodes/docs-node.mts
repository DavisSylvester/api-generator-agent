import type { PipelineStateType } from '../graph/state.mts';
import { MODEL_CHAINS } from '../config/models.mts';
import { invokeWithFallback } from '../llm/create-chat-model.mts';

const SYSTEM_PROMPT = `You are a technical writer generating Hoppscotch API collection files.
Analyze Elysia API source code and produce a Hoppscotch collection JSON (v3 format).
Group requests by domain into folders. Include example payloads. Base URL: http://localhost:3000.
All routes under /api/v1. Respond with only the JSON.`;

export async function docsNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  console.log(`[docs-node] Starting Hoppscotch collection generation`);

  if (!state.allGeneratedCode) {
    console.warn('[docs-node] No code available to document — skipping');
    return { hoppscotchCollection: '', error: 'No code to document' };
  }

  console.log(`[docs-node] Generating docs from ${state.allGeneratedCode.length} chars of code`);
  const startMs = performance.now();
  const host = Bun.env['OLLAMA_HOST'] ?? 'http://192.168.128.230:11434';

  const result = await invokeWithFallback(
    host,
    MODEL_CHAINS.documentation,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate a Hoppscotch collection for this API:\n\n${state.allGeneratedCode}` },
    ],
    { agentRole: 'documentation', runId: state.runId, tags: ['documentation'] },
  );

  if (!result.ok) {
    console.error(`[docs-node] Documentation generation failed: ${result.error.message}`);
    return { error: `Documentation failed: ${result.error.message}` };
  }

  const jsonMatch = result.value.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[docs-node] No JSON found in LLM response');
    return { error: 'No JSON found in documentation response' };
  }

  const durationMs = Math.round(performance.now() - startMs);
  console.log(`[docs-node] Hoppscotch collection generated in ${durationMs}ms (${jsonMatch[0].length} chars)`);

  return { hoppscotchCollection: jsonMatch[0] };
}
