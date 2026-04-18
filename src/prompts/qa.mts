const QA_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/qa-system.md`).text();

const QA_TEST_INSTRUCTIONS: Readonly<Record<string, string>> = {
  setup: await Bun.file(`${import.meta.dir}/md/qa-tests/setup.md`).text(),
  model: await Bun.file(`${import.meta.dir}/md/qa-tests/model.md`).text(),
  repository: await Bun.file(`${import.meta.dir}/md/qa-tests/repository.md`).text(),
  service: await Bun.file(`${import.meta.dir}/md/qa-tests/service.md`).text(),
  endpoint: await Bun.file(`${import.meta.dir}/md/qa-tests/endpoint.md`).text(),
};

function getTaskTypeTestInstructions(taskType?: string): string {
  return QA_TEST_INSTRUCTIONS[taskType ?? ``] ?? ``;
}

export function createQaUserPrompt(
  taskName: string,
  taskDescription: string,
  code: string,
  knowledge?: string,
  taskType?: string,
  availableExports?: readonly string[],
): string {
  const knowledgeSection = knowledge && knowledge.trim().length > 0
    ? `\n## Learnings from Previous Test Runs\nThe following knowledge was accumulated from prior test failures. Apply these lessons to avoid repeating the same mistakes:\n\n${knowledge}\n`
    : ``;

  const taskTypeSection = getTaskTypeTestInstructions(taskType);

  const exportsSection = availableExports && availableExports.length > 0
    ? `\n## Available Exports (ONLY import from this list)\nThe following names are exported by the generated code. Do NOT import any name that is not in this list.\n\n${availableExports.map((e) => `- ${e}`).join('\n')}\n`
    : ``;

  return `## Task Under Test: ${taskName}

${taskDescription}
${taskTypeSection}${knowledgeSection}${exportsSection}
## Implementation Code
${code}

Generate a comprehensive test suite for this implementation. Cover happy paths, validation errors, and edge cases.
Use bun:test imports and Elysia .handle() for HTTP tests — do NOT use fetch() against localhost.
Remember: import source code from \`../code/\` since tests run from \`tests/\` directory.`;
}

export { QA_SYSTEM_PROMPT };
