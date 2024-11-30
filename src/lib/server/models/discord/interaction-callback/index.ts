import type { InteractionCallbackMessage } from './message';
import type { InteractionCallbackModal } from './modal';
import type { InteractionCallbackPing } from './ping';

export type InteractionCallback = InteractionCallbackPing | InteractionCallbackMessage | InteractionCallbackModal;
