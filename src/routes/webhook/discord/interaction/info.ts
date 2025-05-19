import type { Logger } from 'pino';
import { strictEqual } from 'node:assert/strict';

import { APP_ICON_URL, APP_WEBSITE, DEVELOPER_ICON_URL } from '$lib/server/constants';

import { EmbedType } from '$lib/server/models/discord/embed';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import type { Message } from '$lib/server/models/discord/message';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { parsePublic } from './util';

export function handleInfo(
  logger: Logger,
  [arg, ...otherArgs]: InteractionApplicationCommandChatInputOption[],
): Partial<Message> {
  strictEqual(otherArgs.length, 0);

  const isPublic = parsePublic(arg);
  logger.info({ isPublic }, 'info page summoned');

  return {
    flags: isPublic ? void 0 : MessageFlags.Ephemeral,
    components: [
      {
        type: MessageComponentType.ActionRow,
        components: [
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Link,
            emoji: { id: null, name: '📚' },
            label: 'Read the Docs',
            url: new URL('https://spectro.fly.dev/docs/'),
          },
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Link,
            emoji: { id: null, name: '🐛' },
            label: 'Report a Bug',
            url: new URL('https://github.com/BastiDood/spectro/issues/new'),
          },
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Link,
            emoji: { id: null, name: '💻' },
            label: 'Fork the Code',
            url: new URL('https://github.com/BastiDood/spectro/fork'),
          },
        ],
      },
    ],
    embeds: [
      {
        type: EmbedType.Rich,
        color: 0xf7951d,
        title: 'About Spectro',
        description: `[Spectro](${APP_WEBSITE}) enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.`,
        author: {
          name: 'Spectro',
          icon_url: APP_ICON_URL,
          url: APP_WEBSITE,
        },
        footer: {
          icon_url: DEVELOPER_ICON_URL,
          text: 'Coded with love by @bastidood. Themes, designs, and branding by @jellycanne.',
        },
      },
    ],
  };
}
