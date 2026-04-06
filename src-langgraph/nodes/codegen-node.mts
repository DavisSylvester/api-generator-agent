import type { PipelineStateType } from '../graph/state.mts';
import { MODEL_CHAINS } from '../config/models.mts';
import { invokeWithFallback } from '../llm/create-chat-model.mts';
import type { CodeFile } from '../types/task.mts';

const SYSTEM_PROMPT = `You are an expert TypeScript developer specializing in Elysia APIs with BunJS.
Generate production-quality code following strict patterns: DI, repositories returning Result<T,E>, Zod validation, Winston logging, .mts extensions, strict TypeScript.

Output each file as a fenced code block with the file path:
\`\`\`src/path/file.mts
// code
\`\`\``;

export async function codegenNode(
  state: PipelineStateType,
): Promise<Partial<PipelineStateType>> {
  const host = Bun.env['OLLAMA_HOST'] ?? 'http://192.168.128.230:11434';
  const isFixMode = state.iteration > 0 && state.qaErrors.length > 0;

  console.log(`[codegen-node] Task: "${state.currentTaskName}" | Mode: ${isFixMode ? 'fix' : 'generate'} | Iteration: ${state.iteration}`);
  if (isFixMode) {
    console.log(`[codegen-node] Fixing ${state.qaErrors.length} errors from previous iteration`);
  }

  let userPrompt: string;
  if (isFixMode) {
    const prevCode = state.codeFiles
      .map((f) => `// ${f.path}\n${f.content}`)
      .join('\n\n');
    const errorList = state.qaErrors
      .map((e, i) => `${i + 1}. ${e}`)
      .join('\n');
    userPrompt = `## Task: ${state.currentTaskName}\n\n${state.currentTaskDescription}\n\n## Previous Code (has errors)\n${prevCode}\n\n## Errors to Fix\n${errorList}\n\nFix ALL errors. Output complete corrected files.`;
  } else {
    userPrompt = `## Task: ${state.currentTaskName}\n\n${state.currentTaskDescription}\n\nGenerate all required files with complete implementations.`;
  }

  const result = await invokeWithFallback(
    host,
    MODEL_CHAINS.codegen,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      agentRole: 'codegen',
      runId: state.runId,
      taskId: state.currentTaskId,
      iteration: state.iteration,
      tags: ['codegen', `task:${state.currentTaskId}`, `iter:${state.iteration}`],
    },
  );

  if (!result.ok) {
    console.error(`[codegen-node] CodeGen failed: ${result.error.message}`);
    return { error: `CodeGen failed: ${result.error.message}`, codeFiles: [] };
  }

  console.log(`[codegen-node] Parsing code blocks from LLM response`);
  const files = parseCodeBlocks(result.value.content);
  if (files.length === 0) {
    console.warn('[codegen-node] No code blocks found in LLM response');
    return { error: 'No code blocks found in codegen response', codeFiles: [] };
  }

  console.log(`[codegen-node] Generated ${files.length} files:`);
  for (const file of files) {
    console.log(`[codegen-node]   - ${file.path} (${file.content.length} chars)`);
  }

  return { codeFiles: files, error: '' };
}

function parseCodeBlocks(content: string): CodeFile[] {
  const files: CodeFile[] = [];
  const regex = /```([^\n]+\.mts)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1]?.trim();
    const code = match[2]?.trim();
    if (path && code) {
      files.push({ path, content: code });
    }
  }

  if (files.length === 0) {
    const fallbackRegex = /```(?:typescript|ts)?\n([\s\S]*?)```/g;
    let fallbackMatch: RegExpExecArray | null;
    let index = 0;
    while ((fallbackMatch = fallbackRegex.exec(content)) !== null) {
      const code = fallbackMatch[1]?.trim();
      if (code) {
        files.push({ path: `generated-${index}.mts`, content: code });
        index++;
      }
    }
  }

  return files;
}
