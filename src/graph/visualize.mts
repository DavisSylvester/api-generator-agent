import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TaskGraph } from '../types/task.mts';

export function generateMermaid(graph: TaskGraph): string {
  const lines: string[] = [
    'graph TD;',
    '  START((START));',
    '  END((END));',
  ];

  for (const task of graph.tasks) {
    const label = task.name.replace(/"/g, '\\"');
    lines.push(`  ${task.id}["${label}<br/><i>${task.type}</i>"];`);
  }

  lines.push('');

  const tasksWithNoDeps = graph.tasks.filter((t) => t.dependsOn.length === 0);
  for (const task of tasksWithNoDeps) {
    lines.push(`  START --> ${task.id};`);
  }

  for (const task of graph.tasks) {
    for (const dep of task.dependsOn) {
      lines.push(`  ${dep} --> ${task.id};`);
    }
  }

  const allDepTargets = new Set(graph.tasks.flatMap((t) => t.dependsOn));
  const leafTasks = graph.tasks.filter((t) => !allDepTargets.has(t.id));
  for (const task of leafTasks) {
    lines.push(`  ${task.id} --> END;`);
  }

  lines.push('');
  lines.push('  style START fill:#2d8659,stroke:#1a5c3a,color:#fff;');
  lines.push('  style END fill:#c0392b,stroke:#96281b,color:#fff;');

  return lines.join('\n');
}

export async function visualizeFromFile(planPath: string): Promise<string> {
  const resolved = resolve(planPath);
  const content = await readFile(resolved, 'utf-8');
  const graph = JSON.parse(content) as TaskGraph;
  return generateMermaid(graph);
}

async function main(): Promise<void> {
  const planPath = process.argv[2];

  if (!planPath) {
    console.error('Usage: bun run src/graph/visualize.mts <path-to-plan.json>');
    console.error('');
    console.error('Outputs a Mermaid diagram to stdout.');
    console.error('Paste into https://mermaid.live or a Mermaid-compatible viewer.');
    process.exit(1);
  }

  const mermaid = await visualizeFromFile(planPath);
  console.log(mermaid);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}
