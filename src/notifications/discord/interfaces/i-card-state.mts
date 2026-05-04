import type { Static } from '@sinclair/typebox';
import type { CardStateSchema, CardStatusSchema, CardStepSchema, PersistedCardsSchema } from '../schemas/card-state-schema.mts';

export type CardStatus = Static<typeof CardStatusSchema>;
export type CardStep = Static<typeof CardStepSchema>;
export type ICardState = Static<typeof CardStateSchema>;
export type IPersistedCards = Static<typeof PersistedCardsSchema>;
