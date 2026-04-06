import { END, START, StateGraph, Annotation, MemorySaver } from '@langchain/langgraph';

const PipelineState = Annotation.Root({
  prdText: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  runId: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  taskGraph: Annotation<unknown>({
    reducer: (_prev: unknown, next: unknown) => next,
    default: () => null,
  }),
  currentTaskId: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  error: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  allGeneratedCode: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  hoppscotchCollection: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
});

async function plan(state: typeof PipelineState.State) {
  return { taskGraph: state.taskGraph };
}

async function collectCode(state: typeof PipelineState.State) {
  return { allGeneratedCode: state.allGeneratedCode };
}

async function docs(state: typeof PipelineState.State) {
  return { hoppscotchCollection: state.hoppscotchCollection };
}

const workflow = new StateGraph(PipelineState)
  .addNode('plan', plan)
  .addNode('collect_code', collectCode)
  .addNode('docs', docs)
  .addEdge(START, 'plan')
  .addConditionalEdges('plan', (state) => {
    if (state.error) return 'end';
    return 'collect_code';
  }, {
    collect_code: 'collect_code',
    end: END,
  })
  .addEdge('collect_code', 'docs')
  .addEdge('docs', END);

export const graph = workflow.compile({
  checkpointer: new MemorySaver(),
});
