import { END, START, StateGraph, Annotation, MemorySaver } from '@langchain/langgraph';

const TaskState = Annotation.Root({
  currentTaskId: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  currentTaskName: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  currentTaskDescription: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
  codeFiles: Annotation<unknown[]>({
    reducer: (_prev: unknown[], next: unknown[]) => next,
    default: () => [],
  }),
  lintedCodeFiles: Annotation<unknown[]>({
    reducer: (_prev: unknown[], next: unknown[]) => next,
    default: () => [],
  }),
  qaErrors: Annotation<string[]>({
    reducer: (_prev: string[], next: string[]) => next,
    default: () => [],
  }),
  qaPassed: Annotation<boolean>({
    reducer: (_prev: boolean, next: boolean) => next,
    default: () => false,
  }),
  iteration: Annotation<number>({
    reducer: (_prev: number, next: number) => next,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_prev: number, next: number) => next,
    default: () => 5,
  }),
  error: Annotation<string>({
    reducer: (_prev: string, next: string) => next,
    default: () => '',
  }),
});

async function codegen(state: typeof TaskState.State) {
  return { codeFiles: state.codeFiles };
}

async function eslint(state: typeof TaskState.State) {
  return { lintedCodeFiles: state.lintedCodeFiles };
}

async function qa(state: typeof TaskState.State) {
  return { iteration: state.iteration + 1 };
}

async function saveResult(state: typeof TaskState.State) {
  return {};
}

const workflow = new StateGraph(TaskState)
  .addNode('codegen', codegen)
  .addNode('eslint', eslint)
  .addNode('qa', qa)
  .addNode('save_result', saveResult)
  .addEdge(START, 'codegen')
  .addEdge('codegen', 'eslint')
  .addEdge('eslint', 'qa')
  .addConditionalEdges('qa', (state) => {
    if (state.qaPassed) return 'save_result';
    if (state.iteration >= state.maxIterations) return 'save_result';
    return 'codegen';
  }, {
    save_result: 'save_result',
    codegen: 'codegen',
  })
  .addEdge('save_result', END);

export const graph = workflow.compile({
  checkpointer: new MemorySaver(),
});
