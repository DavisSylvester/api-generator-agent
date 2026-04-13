import type { LlmProvider } from './env.mjs';

export type AgentRole = 'planning' | 'codegen' | 'documentation' | 'qa' | 'flutter-ui';

export interface ModelChainConfig {
  readonly models: readonly string[];
  readonly temperature: number;
}

export const PROVIDER_MODEL_MAP: Readonly<Record<LlmProvider, Record<AgentRole, ModelChainConfig>>> = {
  ollama: {
    planning: { models: ['qwen3.5:27b'], temperature: 0.3 },
    codegen: { models: ['qwen3-coder-next'], temperature: 0.2 },
    documentation: { models: ['qwen3.5:27b'], temperature: 0.1 },
    qa: { models: ['qwen3-coder-next'], temperature: 0.2 },
    'flutter-ui': { models: ['qwen3-coder-next'], temperature: 0.2 },
  },
  openai: {
    planning: { models: ['gpt-5.4'], temperature: 0.3 },
    codegen: { models: ['gpt-5.4'], temperature: 0.2 },
    documentation: { models: ['gpt-5.4'], temperature: 0.1 },
    qa: { models: ['gpt-5.4'], temperature: 0.2 },
    'flutter-ui': { models: ['gpt-5.4'], temperature: 0.2 },
  },
  anthropic: {
    planning: { models: ['claude-sonnet-4-6'], temperature: 0.3 },
    codegen: { models: ['claude-sonnet-4-6'], temperature: 0.2 },
    documentation: { models: ['claude-sonnet-4-6'], temperature: 0.1 },
    qa: { models: ['claude-sonnet-4-6'], temperature: 0.2 },
    'flutter-ui': { models: ['claude-sonnet-4-6'], temperature: 0.2 },
  },
};

export const MODEL_CHAINS: Readonly<Record<AgentRole, ModelChainConfig>> = PROVIDER_MODEL_MAP.ollama;
