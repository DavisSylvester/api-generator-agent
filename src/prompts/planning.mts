const PLANNING_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/planning-system.md`).text();

export function createPlanningUserPrompt(prdText: string): string {
  return `Analyze the following PRD and generate a complete task breakdown for implementing this API.

## PRD
${prdText}

Generate the task list as JSON. Ensure tasks are ordered correctly and dependencies are explicit.`;
}

export { PLANNING_SYSTEM_PROMPT };
