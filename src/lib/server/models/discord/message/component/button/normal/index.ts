import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import type { Emoji } from '$lib/server/models/discord/emoji';

/**
 * Outbound interface for a normal (non-link, non-premium) button.
 */
export interface MessageComponentButtonNormal {
  type: MessageComponentType.Button;
  style:
    | MessageComponentButtonStyle.Primary
    | MessageComponentButtonStyle.Secondary
    | MessageComponentButtonStyle.Success
    | MessageComponentButtonStyle.Danger;
  custom_id: string;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
}

/** Alias for backward compatibility. */
export type CreateButtonNormal = MessageComponentButtonNormal;
