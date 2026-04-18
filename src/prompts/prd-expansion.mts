const PRD_EXPANSION_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/prd-expansion-system.md`).text();

export function createPrdExpansionUserPrompt(userPrompt: string): string {
  return `Expand the following user prompt into a complete PRD using the required structure.

## User Prompt

${userPrompt}

Generate the PRD now. Plain Markdown, no code fences. Start with \`# <Project Name>\` on the first line.`;
}

export { PRD_EXPANSION_SYSTEM_PROMPT };
