import { Type } from '@sinclair/typebox';

export const DiscordTransportKindSchema = Type.Union([
  Type.Literal('webhook'),
  Type.Literal('bot'),
]);

export const DiscordConfigSchema = Type.Object({
  enabled: Type.Boolean(),
  transport: DiscordTransportKindSchema,

  // Webhook mode
  pipelineWebhookUrl: Type.Optional(Type.String()),
  qaToolsWebhookUrl: Type.Optional(Type.String()),
  alertWebhookUrl: Type.Optional(Type.String()),

  // Bot mode
  botToken: Type.Optional(Type.String()),
  pipelineChannelId: Type.Optional(Type.String()),
  qaToolsChannelId: Type.Optional(Type.String()),
  alertChannelId: Type.Optional(Type.String()),

  // Common
  alertMention: Type.Optional(Type.String()),
});
