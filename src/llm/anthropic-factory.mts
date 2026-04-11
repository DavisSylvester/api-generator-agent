import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';

export interface AnthropicFactoryConfig {
  readonly apiKey: string;
}

export class AnthropicFactory implements ILlmFactory {

  private readonly apiKey: string;

  constructor(config: AnthropicFactoryConfig) {
    this.apiKey = config.apiKey;
  }

  public create(model: string, temperature: number): BaseChatModel {
    return new ChatAnthropic({
      anthropicApiKey: this.apiKey,
      model,
      temperature,
      maxTokens: 8192,
    });
  }

  public createWithThinking(model: string, temperature: number): BaseChatModel {
    return this.create(model, temperature);
  }
}
