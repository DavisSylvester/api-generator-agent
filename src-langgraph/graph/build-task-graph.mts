import { END, START, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { PipelineState } from './state.mts';
import { codegenNode } from '../nodes/codegen-node.mts';
import { eslintNode } from '../nodes/eslint-node.mts';
import { qaNode } from '../nodes/qa-node.mts';
import { saveResultNode } from '../nodes/save-result-node.mts';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildTaskGraph() {
  const workflow = new StateGraph(PipelineState)
    .addNode('codegen', codegenNode)
    .addNode('eslint', eslintNode)
    .addNode('qa', qaNode)
    .addNode('save_result', saveResultNode)
    .addEdge(START, 'codegen')
    .addEdge('codegen', 'eslint')
    .addEdge('eslint', 'qa')
    .addConditionalEdges('qa', (state) => {
      if (state.qaPassed) {
        return 'save_result';
      }
      if (state.iteration >= state.maxIterations) {
        return 'save_result';
      }
      return 'codegen';
    }, {
      save_result: 'save_result',
      codegen: 'codegen',
    })
    .addEdge('save_result', END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
