import { strictEqual } from 'node:assert/strict';

import { APP_WEBSITE } from '$lib/server/constants';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import type { CreateMessage } from '$lib/server/models/discord/message';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { MessageComponent } from '$lib/server/models/discord/message/component';

import { parsePublic } from './util';

const SERVICE_NAME = 'webhook.interaction.help';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export function handleHelp([
  arg,
  ...otherArgs
]: InteractionApplicationCommandChatInputOption[]): Partial<CreateMessage> {
  return tracer.span('handle-help', span => {
    strictEqual(otherArgs.length, 0);

    const isPublic = parsePublic(arg);
    span.setAttribute('public', isPublic);
    logger.info('help page summoned');

    const components: MessageComponent[] = [
      {
        type: MessageComponentType.Container,
        accent_color: 0xf7951d,
        components: [
          {
            type: MessageComponentType.TextDisplay,
            content: `# Help Page`,
          },
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
              '**`/info [preview]`**\nView important information and links about Spectro. By default, the information page is shown privately, but you can enable the `public` message mode. This command can be run anywhere: server channels, private DMs, etc.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`/help [preview]`**\nOpen this very help page. By default, the help page is shown privately, but you can enable the `public` message mode. This command can be run anywhere: server channels, private DMs, etc.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`/confess`**\nRequires the **"Send Messages"** permission. Send a confession to a channel via modal. This command fails if the current channel has not yet been configured to receive confessions.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`Apps > Reply Anonymously`**\nRequires the **"Send Messages"** permission. You can anonymously reply to any message (in a confessions-enabled channel) by right-clicking on that message and invoking the `Apps > Reply Anonymously` command.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`/setup <channel> [label] [color] [approval]`**\nRequires the **"Manage Channels"** permission. Enables confessions for the current channel. All confessions will be logged in the provided `channel`. Optionally, you can set a `label` to be used for the embed title (e.g., "Confession" by default). You may also set the RGB `color` hex code that will be used for the embeds. Finally, you may set whether to require prior `approval` before publishing a confession to a channel (e.g., no approval required by default). Running this command again will simply overwrite the affected previous settings.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`/lockdown`**\nRequires the **"Manage Channels"** permission. Temporarily disables anonymous confessions for the channel. Previous settings are preserved for the next time `/setup` is run.',
          },
          {
            type: MessageComponentType.TextDisplay,
            content:
              '**`/resend <id>`**\nRequires the **"Manage Messages"** permission. Resends an existing confession by its `id`. This is useful for times when a confession message has been accidentally deleted. Note that the current channel settings are still enforced.',
          },
          {
            type: MessageComponentType.Separator,
            divider: true,
          },
          {
            type: MessageComponentType.TextDisplay,
            content: '-# Coded with love by <@374495340902088704>...',
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
        users: ['374495340902088704'], // @bastidood
      },
      components,
    };
  });
}
