import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface OpenAIFactoryConfig {
  readonly apiKey: string;
}

export class OpenAIFactory {

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
}
