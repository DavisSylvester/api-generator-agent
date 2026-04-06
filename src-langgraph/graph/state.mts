import { Annotation } from '@langchain/langgraph';
import type { TaskGraph, TaskResult, CodeFile } from '../types/task.mts';

export const PipelineState = Annotation.Root({
  prdText: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  runId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  taskGraph: Annotation<TaskGraph | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  currentTaskId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  currentTaskName: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  currentTaskDescription: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  codeFiles: Annotation<readonly CodeFile[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  lintedCodeFiles: Annotation<readonly CodeFile[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  qaErrors: Annotation<readonly string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  qaPassed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  iteration: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 5,
  }),
  taskResults: Annotation<readonly TaskResult[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  allGeneratedCode: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  hoppscotchCollection: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  error: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  workspaceDir: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '.workspace',
  }),
});

export type PipelineStateType = typeof PipelineState.State;
