import { buildPipelineGraph } from './build-pipeline-graph.mts';
import { buildTaskGraph } from './build-task-graph.mts';

export function visualizePipelineGraph(): string {
  const compiled = buildPipelineGraph();
  const graph = compiled.getGraph();
  return graph.drawMermaid();
}

export function visualizeTaskGraph(): string {
  const compiled = buildTaskGraph();
  const graph = compiled.getGraph();
  return graph.drawMermaid();
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'both';

  if (mode === 'pipeline' || mode === 'both') {
    console.log('## Pipeline Graph (plan → collect → docs)\n');
    console.log('```mermaid');
    console.log(visualizePipelineGraph());
    console.log('```\n');
  }

  if (mode === 'task' || mode === 'both') {
    console.log('## Task Graph (codegen → eslint → qa → fix loop)\n');
    console.log('```mermaid');
    console.log(visualizeTaskGraph());
    console.log('```\n');
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
}
