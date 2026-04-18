const QA_INTEGRATION_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/qa-integration-system.md`).text();

export function createQaIntegrationUserPrompt(
  taskName: string,
  taskDescription: string,
  code: string,
  knowledge?: string,
): string {
  const knowledgeSection = knowledge && knowledge.trim().length > 0
    ? `\n## Learnings from Previous Test Runs\nApply these lessons to avoid repeating the same mistakes:\n\n${knowledge}\n`
    : '';

  return `## Task Under Test: ${taskName}

${taskDescription}
${knowledgeSection}
## Implementation Code
${code}

Generate a Hoppscotch collection JSON that exercises every endpoint in this implementation.
Include testScript assertions on every request. Use <<BASE_URL>> for the server address.
Order requests so that creation endpoints run before read/update/delete (chain IDs with pw.env.set/get).`;
}

export { QA_INTEGRATION_SYSTEM_PROMPT };
