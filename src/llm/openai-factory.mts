import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ILlmFactory } from '../interfaces/i-llm-factory.mjs';

export interface OpenAIFactoryConfig {
  readonly apiKey: string;
}

export class OpenAIFactory implements ILlmFactory {

  private readonly apiKey: string;

  constructor(config: OpenAIFactoryConfig) {
    this.apiKey = config.apiKey;
  }

  public create(model: string, temperature: number): BaseChatModel {
    return new ChatOpenAI({
      openAIApiKey: this.apiKey,
      model,
      temperature,
      maxTokens: 16384,
    });
  }

  public createWithThinking(model: string, temperature: number): BaseChatModel {
    return this.create(model, temperature);
  }
}
