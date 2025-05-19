import type { InteractionResponseMessage } from './message';
import type { InteractionResponseModal } from './modal';
import type { InteractionResponsePing } from './ping';

export type InteractionResponse =
  | InteractionResponsePing
  | InteractionResponseMessage
  | InteractionResponseModal;
