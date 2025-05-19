import { strictEqual } from 'node:assert/strict';

import { APP_ICON_URL, APP_WEBSITE, DEVELOPER_ICON_URL } from '$lib/server/constants';

import type { Logger } from 'pino';

import { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { parsePublic } from './util';

export function handleHelp(
    logger: Logger,
    [arg, ...otherArgs]: InteractionApplicationCommandChatInputOption[],
): Partial<Message> {
    strictEqual(otherArgs.length, 0);

    const isPublic = parsePublic(arg);
    logger.info({ isPublic }, 'help page summoned');

    return {
        flags: isPublic ? void 0 : MessageFlags.Ephemeral,
        embeds: [
            {
                color: 0xf7951d,
                title: 'Help Page',
                description: `[Spectro](${APP_WEBSITE}) enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.`,
                author: {
                    name: 'Spectro',
                    icon_url: APP_ICON_URL,
                    url: APP_WEBSITE,
                },
                fields: [
                    {
                        name: '`/info [preview]`',
                        value: 'View important information and links about Spectro. By default, the information page is shown privately, but you can enable the `public` message mode. This command can be run anywhere: server channels, private DMs, etc.',
                        inline: false,
                    },
                    {
                        name: '`/help [preview]`',
                        value: 'Open this very help page. By default, the help page is shown privately, but you can enable the `public` message mode. This command can be run anywhere: server channels, private DMs, etc.',
                        inline: false,
                    },
                    {
                        name: '`/confess <content> [attachment]`',
                        value: 'Requires the **"Send Messages"** permission and the **"Attach Files"** permission (only when sending an `attachment`). Send a confession to a channel. This command fails if the current channel has not yet been configured to receive confessions.',
                    },
                    {
                        name: '`Apps > Reply Anonymously`',
                        value: 'Requires the **"Send Messages"** permission. You can anonymously reply to any message (in a confessions-enabled channel) by right-clicking on that message and invoking the `Apps > Reply Anonymously` command.',
                        inline: false,
                    },
                    {
                        name: '`/setup <channel> [label] [color] [approval]`',
                        value: 'Requires the **"Manage Channels"** permission. Enables confessions for the current channel. All confessions will be logged in the provided `channel`. Optionally, you can set a `label` to be used for the embed title (e.g., "Confession" by default). You may also set the RGB `color` hex code that will be used for the embeds. Finally, you may set whether to require prior `approval` before publishing a confession to a channel (e.g., no approval required by default). Running this command again will simply overwrite the affected previous settings.',
                    },
                    {
                        name: '`/lockdown`',
                        value: 'Requires the **"Manage Channels"** permission. Temporarily disables anonymous confessions for the channel. Previous settings are preserved for the next time `/setup` is run.',
                    },
                    {
                        name: '`/resend <id>`',
                        value: 'Requires the **"Manage Messages"** permission. Resends an existing confession by its `id`. This is useful for times when a confession message has been accidentally deleted. Note that the current channel settings are still enforced.',
                    },
                ],
                footer: {
                    icon_url: DEVELOPER_ICON_URL,
                    text: 'Coded with love by BastiDood...',
                },
            },
        ],
    };
}
