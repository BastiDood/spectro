import { strictEqual } from 'node:assert/strict';

import { APP_WEBSITE } from '$lib/server/constants';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { CreateMessage } from '$lib/server/models/discord/message';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { MessageComponent } from '$lib/server/models/discord/message/component';

import { parsePublic } from './util';

const SERVICE_NAME = 'webhook.interaction.info';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export function handleInfo([
  arg,
  ...otherArgs
]: InteractionApplicationCommandChatInputOption[]): Partial<CreateMessage> {
  return tracer.span('handle-info', span => {
    strictEqual(otherArgs.length, 0);

    const isPublic = parsePublic(arg);
    span.setAttribute('public', isPublic);
    logger.info('info page summoned');

    const components: MessageComponent[] = [
      {
        type: MessageComponentType.Container,
        accent_color: 0xf7951d,
        components: [
          {
            type: MessageComponentType.TextDisplay,
            content: `[Spectro](${APP_WEBSITE}) enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.`,
          },
          {
            type: MessageComponentType.Separator,
            divider: true,
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '-# Coded with love by <@374495340902088704>. Themes, designs, and branding by <@372372038264029184>.',
          },
          {
            type: MessageComponentType.ActionRow,
            components: [
              {
                type: MessageComponentType.Button,
                style: MessageComponentButtonStyle.Link,
                emoji: { id: null, name: '📚' },
                label: 'Read the Docs',
                url: 'https://spectro.bastidood.dev/docs/',
              },
              {
                type: MessageComponentType.Button,
                style: MessageComponentButtonStyle.Link,
                emoji: { id: null, name: '🐛' },
                label: 'Report a Bug',
                url: 'https://github.com/BastiDood/spectro/issues/new',
              },
              {
                type: MessageComponentType.Button,
                style: MessageComponentButtonStyle.Link,
                emoji: { id: null, name: '💻' },
                label: 'Fork the Code',
                url: 'https://github.com/BastiDood/spectro/fork',
              },
            ],
          },
        ],
      },
    ];

    let flags = MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications;
    if (!isPublic) flags |= MessageFlags.Ephemeral;

    return {
      flags,
      allowed_mentions: {
        users: [
          '374495340902088704', // @bastidood
          '372372038264029184', // @jellycanne
        ],
      },
      components,
    };
  });
}
