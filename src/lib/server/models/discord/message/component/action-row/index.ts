import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponentButton } from '$lib/server/models/discord/message/component/button';

/**
 * Outbound interface for an action row containing buttons.
 * Used in messages with interactive button components.
 */
export interface MessageComponentActionRowButtons {
  /** Component type identifier. */
  type: MessageComponentType.ActionRow;
  /** 1-5 button components. */
  components: MessageComponentButton[];
}

/**
 * Outbound type for action rows in messages.
 * Note: For modals, use the Label component instead of ActionRow with TextInput.
 */
export type MessageComponentActionRow = MessageComponentActionRowButtons;
