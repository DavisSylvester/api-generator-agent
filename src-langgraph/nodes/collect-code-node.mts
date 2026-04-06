import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { PipelineStateType } from '../graph/state.mts';

export async function collectCodeNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  console.log(`[collect-code-node] Collecting generated code from all tasks`);

  if (!state.taskGraph) {
    console.warn('[collect-code-node] No task graph available — skipping');
    return { allGeneratedCode: '' };
  }

  console.log(`[collect-code-node] Scanning ${state.taskGraph.tasks.length} tasks for code files`);
  const parts: string[] = [];
  let totalFiles = 0;

  for (const task of state.taskGraph.tasks) {
    const codeDir = join(state.workspaceDir, state.runId, 'tasks', task.id, 'code');
    try {
      const entries = await readdir(codeDir, { withFileTypes: true });
      let taskFileCount = 0;
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.mts')) {
          const content = await Bun.file(join(codeDir, entry.name)).text();
          parts.push(`// ${task.id}/${entry.name}\n${content}`);
          taskFileCount++;
        }
      }
      if (taskFileCount > 0) {
        console.log(`[collect-code-node]   Task ${task.id}: ${taskFileCount} files`);
        totalFiles += taskFileCount;
      }
    } catch {
      console.log(`[collect-code-node]   Task ${task.id}: no code produced`);
    }
  }

  console.log(`[collect-code-node] Collected ${totalFiles} files total (${parts.join('\n\n').length} chars)`);

  return { allGeneratedCode: parts.join('\n\n') };
}
