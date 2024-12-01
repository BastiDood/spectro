import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { EmbedType } from '$lib/server/models/discord/embed';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { DiscordError } from '$lib/server/models/discord/error';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
const DEVELOPER_ICON_URL = new URL(
    'https://cdn.discordapp.com/avatars/374495340902088704/aa236a66d815d3d204b28806e6305064.png',
);

export async function dispatchConfessionViaHttp(
    channelId: Snowflake,
    confessionId: bigint,
    label: string,
    timestamp: Date,
    description: string,
    replyToMessageId: Snowflake | null,
    botToken = DISCORD_BOT_TOKEN,
) {
    const params: CreateMessage = {
        embeds: [
            {
                type: EmbedType.Rich,
                title: `${label} #${confessionId}`,
                description,
                timestamp,
                footer: {
                    text: "Coded with love by BastiDood | Admins can access Spectro's confession logs",
                    icon_url: DEVELOPER_ICON_URL,
                },
            },
        ],
    };

    if (replyToMessageId !== null)
        params.message_reference = {
            type: MessageReferenceType.Default,
            channel_id: channelId,
            message_id: replyToMessageId,
            fail_if_not_exists: false,
        };

    const body = JSON.stringify(params, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
        body,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length.toString(),
            Authorization: `Bot ${botToken}`,
        },
    });

    const json = await response.json();
    if (response.status === 200) {
        console.log('CREATE_MESSAGE:json', json);
        return parse(Message, json);
    }

    const { code, message } = parse(DiscordError, json);
    console.error('CREATE_MESSAGE:fetch', response.status, message);
    return code;
}
