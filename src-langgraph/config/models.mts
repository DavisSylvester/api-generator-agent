export type AgentRole = 'planning' | 'codegen' | 'documentation' | 'qa';

export interface ModelChainConfig {
  readonly models: readonly string[];
  readonly temperature: number;
}

export const MODEL_CHAINS: Readonly<Record<AgentRole, ModelChainConfig>> = {
  planning: {
    models: [
      'qwen3.5:27b',
      'qwen3.5:35b',
    ],
    temperature: 0.3,
  },
  codegen: {
    models: [
      'qwen3-coder:30b',
      'devstral-small-2:24b',
    ],
    temperature: 0.2,
  },
  documentation: {
    models: [
      'qwen3.5:27b',
      'devstral-small-2:24b',
      'qwen3.5:35b',
    ],
    temperature: 0.1,
  },
  qa: {
    models: [
      'qwen3-coder:30b',
      'devstral-small-2:24b',
    ],
    temperature: 0.2,
  },
} as const;
