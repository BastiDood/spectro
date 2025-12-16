import { type InferOutput, literal, object } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import {
  MessageComponentButtonBase,
  MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import type { Emoji } from '$lib/server/models/discord/emoji';
import { Url } from '$lib/server/models/url';

export const MessageComponentButtonLink = object({
  ...MessageComponentButtonBase.entries,
  type: literal(MessageComponentType.Button),
  style: literal(MessageComponentButtonStyle.Link),
  url: Url,
});

export type MessageComponentButtonLink = InferOutput<typeof MessageComponentButtonLink>;

/**
 * Outbound interface for creating a link button.
 * Note: Link buttons don't trigger interactions - they open URLs directly.
 */
export interface CreateButtonLink {
  type: MessageComponentType.Button;
  style: MessageComponentButtonStyle.Link;
  url: string;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
}
