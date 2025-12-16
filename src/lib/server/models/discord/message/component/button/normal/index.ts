import { type InferOutput, literal, object, picklist, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import {
  MessageComponentButtonBase,
  MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import type { Emoji } from '$lib/server/models/discord/emoji';

export const MessageComponentButtonNormal = object({
  ...MessageComponentButtonBase.entries,
  type: literal(MessageComponentType.Button),
  style: picklist([
    MessageComponentButtonStyle.Primary,
    MessageComponentButtonStyle.Secondary,
    MessageComponentButtonStyle.Success,
    MessageComponentButtonStyle.Danger,
  ]),
  custom_id: string(),
});

export type MessageComponentButtonNormal = InferOutput<typeof MessageComponentButtonNormal>;

/**
 * Outbound interface for creating a normal (non-link, non-premium) button.
 */
export interface CreateButtonNormal {
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
