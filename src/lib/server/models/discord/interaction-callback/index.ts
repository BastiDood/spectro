import type { InteractionCallbackMessage } from './message';
import type { InteractionCallbackPing } from './ping';

export type InteractionCallback = InteractionCallbackPing | InteractionCallbackMessage;
