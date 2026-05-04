import type { Static } from '@sinclair/typebox';
import type { DiscordConfigSchema, DiscordTransportKindSchema } from '../schemas/discord-config-schema.mts';

export type DiscordTransportKind = Static<typeof DiscordTransportKindSchema>;
export type IDiscordConfig = Static<typeof DiscordConfigSchema>;
