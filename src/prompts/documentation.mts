const DOCUMENTATION_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/documentation-system.md`).text();

export function createDocumentationUserPrompt(allCode: string): string {
  return `Analyze the following Elysia API source code and generate a complete Hoppscotch collection JSON.

## Source Code
${allCode}

Generate the Hoppscotch collection JSON. Include all endpoints with example payloads.`;
}

export { DOCUMENTATION_SYSTEM_PROMPT };
