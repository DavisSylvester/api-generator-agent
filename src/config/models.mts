import type { LlmProvider } from './env.mjs';

export type AgentRole = 'planning' | 'codegen' | 'documentation' | 'qa' | 'flutter-ui' | 'prd-expansion';

export interface ModelChainConfig {
  readonly models: readonly string[];
  readonly temperature: number;
}

export const PROVIDER_MODEL_MAP: Readonly<Record<LlmProvider, Record<AgentRole, ModelChainConfig>>> = {
  ollama: {
    planning: { models: ['qwen3.6:latest'], temperature: 0.3 },
    codegen: { models: ['qwen3-coder-next:cloud'], temperature: 0.2 },
    documentation: { models: ['qwen3.6:latest'], temperature: 0.1 },
    qa: { models: ['qwen3-coder-next:cloud'], temperature: 0.2 },
    'flutter-ui': { models: ['qwen3-coder-next:cloud'], temperature: 0.2 },
    'prd-expansion': { models: ['qwen3.6:latest'], temperature: 0.3 },
  },
  openai: {
    planning: { models: ['gpt-5.4'], temperature: 0.3 },
    codegen: { models: ['gpt-5.4'], temperature: 0.2 },
    documentation: { models: ['gpt-5.4'], temperature: 0.1 },
    qa: { models: ['gpt-5.4'], temperature: 0.2 },
    'flutter-ui': { models: ['gpt-5.4'], temperature: 0.2 },
    'prd-expansion': { models: ['gpt-5.4'], temperature: 0.3 },
  },
  anthropic: {
    planning: { models: ['claude-opus-4-7'], temperature: 0.3 },
    codegen: { models: ['claude-opus-4-7'], temperature: 0.2 },
    documentation: { models: ['claude-opus-4-7'], temperature: 0.1 },
    qa: { models: ['claude-opus-4-7'], temperature: 0.2 },
    'flutter-ui': { models: ['claude-opus-4-7'], temperature: 0.2 },
    'prd-expansion': { models: ['claude-opus-4-7'], temperature: 0.3 },
  },
};

export const MODEL_CHAINS: Readonly<Record<AgentRole, ModelChainConfig>> = PROVIDER_MODEL_MAP.ollama;
