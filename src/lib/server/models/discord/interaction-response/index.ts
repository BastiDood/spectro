import type { InteractionResponseMessage } from './message/index.ts';
import type { InteractionResponseModal } from './modal/index.ts';
import type { InteractionResponsePing } from './ping/index.ts';

export type InteractionResponse =
  InteractionResponsePing | InteractionResponseMessage | InteractionResponseModal;
