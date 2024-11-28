import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { EmbedType, type RichEmbed } from '$lib/server/models/discord/interaction';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { DiscordError } from '$lib/server/models/discord/error';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

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
            } satisfies RichEmbed,
        ],
    });

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
