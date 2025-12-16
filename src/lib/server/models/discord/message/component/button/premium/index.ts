import { type InferOutput, literal, object, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import {
  MessageComponentButtonBase,
  MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import type { Emoji } from '$lib/server/models/discord/emoji';

export const MessageComponentButtonPremium = object({
  ...MessageComponentButtonBase.entries,
  type: literal(MessageComponentType.Button),
  style: literal(MessageComponentButtonStyle.Premium),
  sku_id: string(),
});

export type MessageComponentButtonPremium = InferOutput<typeof MessageComponentButtonPremium>;

/**
 * Outbound interface for creating a premium button (used for SKU purchases).
 */
export interface CreateButtonPremium {
  type: MessageComponentType.Button;
  style: MessageComponentButtonStyle.Premium;
  sku_id: string;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
}
