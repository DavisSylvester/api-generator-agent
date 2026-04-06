import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import type { PipelineStateType } from '../graph/state.mts';
import type { TaskResult } from '../types/task.mts';

export async function saveResultNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const status = state.qaPassed ? 'completed' : 'failed';
  console.log(`[save-result-node] Saving task ${state.currentTaskId} — status: ${status}, iterations: ${state.iteration}`);

  const codeToSave = state.lintedCodeFiles.length > 0 ? state.lintedCodeFiles : state.codeFiles;
  const codeDir = join(state.workspaceDir, state.runId, 'tasks', state.currentTaskId, 'code');
  await mkdir(codeDir, { recursive: true });

  for (const file of codeToSave) {
    const filePath = join(codeDir, file.path);
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
    console.log(`[save-result-node]   Wrote: ${file.path} (${file.content.length} chars)`);
  }

  const taskResult: TaskResult = {
    taskId: state.currentTaskId,
    status: state.qaPassed ? 'completed' : 'failed',
    iteration: state.iteration,
    codeFiles: codeToSave,
    errors: state.qaErrors as string[],
    lastError: state.qaPassed ? undefined : state.qaErrors[0],
  };

  const statusPath = join(state.workspaceDir, state.runId, 'tasks', state.currentTaskId, 'status.json');
  await writeFile(statusPath, JSON.stringify(taskResult, null, 2), 'utf-8');
  console.log(`[save-result-node] Status written to ${statusPath}`);

  return {
    taskResults: [taskResult],
    codeFiles: [],
    lintedCodeFiles: [],
    qaErrors: [],
    qaPassed: false,
    iteration: 0,
    currentTaskId: '',
    currentTaskName: '',
    currentTaskDescription: '',
  };
}
