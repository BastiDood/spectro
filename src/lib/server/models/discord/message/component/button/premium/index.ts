import type { Emoji } from '$lib/server/models/discord/emoji';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

/**
 * Outbound interface for a premium button (used for SKU purchases).
 */
export interface MessageComponentButtonPremium {
  type: MessageComponentType.Button;
  style: MessageComponentButtonStyle.Premium;
  sku_id: string;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
}

/** Alias for backward compatibility. */
export type CreateButtonPremium = MessageComponentButtonPremium;
