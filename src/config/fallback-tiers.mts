import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface FallbackTier {
  readonly name: string;
  readonly model: string;
  readonly maxIterations: number;
  readonly createChatModel: () => BaseChatModel;
}
