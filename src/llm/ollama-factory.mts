import { ChatOllama } from '@langchain/ollama';

export interface OllamaFactoryConfig {
  readonly host: string;
}

export class OllamaFactory {

  private readonly host: string;

  constructor(config: OllamaFactoryConfig) {
    this.host = config.host;
  }

  public create(model: string, temperature: number): ChatOllama {
    return new ChatOllama({
      baseUrl: this.host,
      model,
      temperature,
      format: undefined,
    });
  }

  public createWithJsonFormat(model: string, temperature: number): ChatOllama {
    return new ChatOllama({
      baseUrl: this.host,
      model,
      temperature,
      format: 'json',
    });
  }
}
