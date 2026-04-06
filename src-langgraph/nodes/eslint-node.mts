import { join } from 'node:path';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import type { PipelineStateType } from '../graph/state.mts';
import type { CodeFile } from '../types/task.mts';

export async function eslintNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  console.log(`[eslint-node] Starting lint pass on ${state.codeFiles.length} files for task: ${state.currentTaskId}`);
  const startMs = performance.now();
  const linted: CodeFile[] = [];
  let successCount = 0;
  let failCount = 0;
  const workDir = join(state.workspaceDir, state.runId, 'tasks', state.currentTaskId, 'lint-tmp');
  await mkdir(workDir, { recursive: true });

  for (const file of state.codeFiles) {
    console.log(`[eslint-node] Linting: ${file.path}`);
    const filePath = join(workDir, file.path);
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');

    try {
      const proc = Bun.spawn(
        ['bun', 'eslint', '--fix', '--no-error-on-unmatched-pattern', filePath],
        { cwd: workDir, stdout: 'pipe', stderr: 'pipe' },
      );
      await proc.exited;

      const lintedContent = await readFile(filePath, 'utf-8');
      linted.push({ path: file.path, content: lintedContent });
      successCount++;
      console.log(`[eslint-node] Linted successfully: ${file.path}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[eslint-node] Lint failed for ${file.path}, using original: ${msg}`);
      linted.push(file);
      failCount++;
    }
  }

  const durationMs = Math.round(performance.now() - startMs);
  console.log(`[eslint-node] Lint complete in ${durationMs}ms — ${successCount} passed, ${failCount} failed`);

  return { lintedCodeFiles: linted };
}
