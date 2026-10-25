import { strictEqual } from 'node:assert/strict';

import type { CreateMessage } from '#lib/server/models/discord/message/index.ts';
import type { InteractionApplicationCommandChatInputOption } from '#lib/server/models/discord/interaction/application-command/chat-input/option/index.ts';
import type { MessageComponent } from '#lib/server/models/discord/message/component/index.ts';
import { MessageComponentButtonStyle } from '#lib/server/models/discord/message/component/button/base.ts';
import { MessageComponentType } from '#lib/server/models/discord/message/component/base.ts';
import { MessageFlags } from '#lib/server/models/discord/message/base.ts';
import { parsePublic } from '#lib/server/interactions/response-visibility.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

const SERVICE_NAME = 'webhook.interaction.info';
const tracer = Tracer.byName(SERVICE_NAME);

export function handleInfo(
  origin: string,
  [arg, ...otherArgs]: InteractionApplicationCommandChatInputOption[],
): Partial<CreateMessage> {
  return tracer.span('handle-info', span => {
    strictEqual(otherArgs.length, 0);

    const isPublic = parsePublic(arg);
    span.setAttribute('spectro.response.public', isPublic);
    const components: MessageComponent[] = [
      {
        type: MessageComponentType.Container,
        accent_color: 0xf7951d,
        components: [
          {
            type: MessageComponentType.TextDisplay,
            content: `[Spectro](${origin}/) enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.`,
          },
          {
            type: MessageComponentType.Separator,
            divider: true,
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '-# Coded with love by [Basti Ortiz](https://bastidood.dev/). Themes, designs, and branding by [Jelly Raborar](https://github.com/Anjellyrika).',
          },
          {
            type: MessageComponentType.ActionRow,
            components: [
              {
                type: MessageComponentType.Button,
                style: MessageComponentButtonStyle.Link,
                emoji: { id: null, name: '📚' },
                label: 'Read the Docs',
                url: `${origin}/guide/`,
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
      components,
    };
  });
}
