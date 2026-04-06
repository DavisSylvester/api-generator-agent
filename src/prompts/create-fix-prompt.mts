export function createFixPrompt(
  taskName: string,
  taskDescription: string,
  previousCode: string,
  errors: readonly string[],
): string {
  return `## Task: ${taskName}

${taskDescription}

## Previous Code (has errors)
${previousCode}

## Errors to Fix
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Fix ALL the errors above. Output the complete corrected files using fenced code blocks with file paths.
Do not skip any files — regenerate all files for this task with the fixes applied.`;
}
