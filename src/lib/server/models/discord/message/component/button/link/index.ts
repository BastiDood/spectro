import type { Emoji } from '#lib/server/models/discord/message/component/emoji.ts';
import { MessageComponentButtonStyle } from '#lib/server/models/discord/message/component/button/base.ts';
import { MessageComponentType } from '#lib/server/models/discord/message/component/base.ts';

/**
 * Outbound interface for a link button.
 * Note: Link buttons don't trigger interactions - they open URLs directly.
 */
export interface MessageComponentButtonLink {
  type: MessageComponentType.Button;
  style: MessageComponentButtonStyle.Link;
  url: string;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
}

/** Alias for backward compatibility. */
export type CreateButtonLink = MessageComponentButtonLink;
