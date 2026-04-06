import { END, START, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { PipelineState } from './state.mts';
import { planNode } from '../nodes/plan-node.mts';
import { collectCodeNode } from '../nodes/collect-code-node.mts';
import { docsNode } from '../nodes/docs-node.mts';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildPipelineGraph() {
  const workflow = new StateGraph(PipelineState)
    .addNode('plan', planNode)
    .addNode('collect_code', collectCodeNode)
    .addNode('docs', docsNode)
    .addEdge(START, 'plan')
    .addConditionalEdges('plan', (state) => {
      if (state.error) {
        return 'end';
      }
      return 'collect_code';
    }, {
      collect_code: 'collect_code',
      end: END,
    })
    .addEdge('collect_code', 'docs')
    .addEdge('docs', END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
