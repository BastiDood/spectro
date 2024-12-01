import { strictEqual } from 'node:assert/strict';

import { APP_ICON_URL, DEVELOPER_ICON_URL } from '$lib/server/constants';

import { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';

function parsePublic(arg?: InteractionApplicationCommandChatInputOption) {
    if (typeof arg === 'undefined') return false;
    strictEqual(arg.type, InteractionApplicationCommandChatInputOptionType.Boolean);
    return arg.value;
}

export function handleHelp([arg, ...otherArgs]: InteractionApplicationCommandChatInputOption[]): Partial<Message> {
    strictEqual(otherArgs.length, 0);
    return {
        flags: parsePublic(arg) ? undefined : MessageFlags.Ephemeral,
        embeds: [
            {
                color: 0x237feb,
                title: 'Help Page',
                description:
                    'Spectro enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.',
                author: {
                    name: 'Spectro',
                    icon_url: APP_ICON_URL,
                    url: new URL('https://spectro.fly.dev/'),
                },
                fields: [
                    {
                        name: '`/help [preview]`',
                        value: 'Open this very help page. By default, the help page is shown privately, but you can enable the `public` message mode. This command can be run anywhere: server channels, private DMs, etc.',
                        inline: false,
                    },
                    {
                        name: '`/confess <content>`',
                        value: 'Send a confession to a channel. This command fails if the current channel has not yet been configured to receive confessions.',
                    },
                    {
                        name: '`Apps > Reply Anonymously`',
                        value: 'You may anonymously reply to any message (in a confessions-enabled channel) by right-clicking on that message and invoking the `Apps > Reply Anonymously` command.',
                        inline: false,
                    },
                    {
                        name: '`/lockdown`',
                        value: '**Moderators and above only:** temporarily disables anonymous confessions for the channel. Previous settings are preserved for the next time `/setup` is run.',
                    },
                    {
                        name: '`/setup [label] [color] [approval]`',
                        value: '**Moderators and above only:** enables confessions for the current channel. Optionally, you may set a `label` to be used for the embed title (e.g., "Confession" by default). You may also set the RGB `color` hex code that will be used for the embeds. Finally, you may set whether to require prior `approval` before publishing a confession to a channel (e.g., no approval required by default). Running this command again will simply overwrite the affected previous settings.',
                    },
                    {
                        name: '`/resend <id>`',
                        value: '**Moderators and above only:** resends an existing confession by its `id`. This is useful for times when a confession message has been accidentally deleted. Note that the current channel settings are still enforced.',
                    },
                    {
                        name: '`/set member|moderator|administrator <@user>`',
                        value: '**Administrators only:** sets the privilege level of `@user`. Setting your own permissions—even as the server owner—is forbidden.',
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
