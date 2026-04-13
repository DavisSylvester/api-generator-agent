export interface FlutterScreenTask {
  readonly screenId: string;
  readonly screenName: string;
  readonly description: string;
  readonly apiEndpoints: readonly string[];
  readonly role: `practitioner` | `gym_owner` | `shared`;
}

export function createFlutterUiUserPrompt(
  task: FlutterScreenTask,
  prdText: string,
  apiEndpointReference: string,
  existingCode?: string,
  errors?: string,
): string {
  const parts: string[] = [];

  parts.push(`## Task: Generate Flutter screen — ${task.screenName} (${task.screenId})`);
  parts.push(``);
  parts.push(`### Screen Description`);
  parts.push(task.description);
  parts.push(``);
  parts.push(`### User Role: ${task.role}`);
  parts.push(``);
  parts.push(`### API Endpoints Used by This Screen`);
  for (const endpoint of task.apiEndpoints) {
    parts.push(`- ${endpoint}`);
  }
  parts.push(``);

  if (apiEndpointReference) {
    parts.push(`### API Reference (request/response shapes)`);
    parts.push(apiEndpointReference);
    parts.push(``);
  }

  parts.push(`### PRD Context`);
  parts.push(prdText.substring(0, 5000));
  parts.push(``);

  if (existingCode) {
    parts.push(`### Existing Code (fix mode — update this code to resolve errors)`);
    parts.push(existingCode);
    parts.push(``);
  }

  if (errors) {
    parts.push(`### Errors to Fix`);
    parts.push(errors);
    parts.push(``);
  }

  parts.push(`### Instructions`);
  parts.push(`Generate ALL Dart files needed for this screen:`);
  parts.push(`1. The screen widget (in \`screens/\`)`);
  parts.push(`2. Any custom widgets (in \`widgets/\`)`);
  parts.push(`3. The Riverpod provider (in \`providers/\`)`);
  parts.push(`4. The data model if not already defined (in \`models/\`)`);
  parts.push(``);
  parts.push(`Each file must be a complete, compilable Dart file with all imports.`);
  parts.push(`Use the Google Stitch design tokens from the system prompt.`);
  parts.push(`Handle loading, error, and empty states.`);

  return parts.join(`\n`);
}
