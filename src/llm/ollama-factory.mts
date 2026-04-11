import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';

export interface OllamaFactoryConfig {
  readonly host: string;
  readonly timeoutMs?: number;
  readonly apiKey?: string;
}

function createLongTimeoutFetch(timeoutMs: number): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(input, {
      ...init,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };
}

export class OllamaFactory implements ILlmFactory {

  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;

  constructor(config: OllamaFactoryConfig) {
    this.host = config.host;
    this.timeoutMs = config.timeoutMs ?? 1800000;
    this.headers = config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : {};
  }

  public create(model: string, temperature: number): BaseChatModel {
    return new ChatOllama({
      baseUrl: this.host,
      model,
      temperature,
      format: undefined,
      keepAlive: `30m`,
      numCtx: 8192,
      think: false,
      headers: this.headers,
      fetch: createLongTimeoutFetch(this.timeoutMs),
    } as ConstructorParameters<typeof ChatOllama>[0]);
  }

  public createWithThinking(model: string, temperature: number): BaseChatModel {
    return new ChatOllama({
      baseUrl: this.host,
      model,
      temperature,
      format: undefined,
      keepAlive: `30m`,
      numCtx: 8192,
      think: true,
      headers: this.headers,
      fetch: createLongTimeoutFetch(this.timeoutMs),
    } as ConstructorParameters<typeof ChatOllama>[0]);
  }

  public createWithJsonFormat(model: string, temperature: number): BaseChatModel {
    return new ChatOllama({
      baseUrl: this.host,
      model,
      temperature,
      format: `json`,
      keepAlive: `30m`,
      numCtx: 8192,
      think: false,
      headers: this.headers,
      fetch: createLongTimeoutFetch(this.timeoutMs),
    } as ConstructorParameters<typeof ChatOllama>[0]);
  }
}
