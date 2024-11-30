import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { type Embed, EmbedType } from '$lib/server/models/discord/embed';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { DiscordError } from '$lib/server/models/discord/error';
import { type CreateMessage, Message } from '$lib/server/models/discord/message';
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
    botToken = DISCORD_BOT_TOKEN,
) {
    const body = JSON.stringify({
        embeds: [
            {
                type: EmbedType.Rich,
                title: `${label} #${confessionId}`,
                description,
                timestamp,
                footer: {
                    text: 'Coded with ❤ by BastiDood',
                    icon_url: DEVELOPER_ICON_URL,
                },
            } satisfies Embed,
        ],
    } satisfies CreateMessage);

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
        return null;
    }

    const { code, message } = parse(DiscordError, json);
    console.error('CREATE_MESSAGE:fetch', response.status, message);
    return code;
}
