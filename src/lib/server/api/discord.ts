import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { EmbedType, type RichEmbed } from '$lib/server/models/discord/interaction';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export async function dispatchConfessionViaHttp(
    channelId: Snowflake,
    confessionId: bigint,
    label: string,
    timestamp: Date,
    content: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    const body = JSON.stringify({
        embeds: [
            {
                type: EmbedType.Rich,
                title: `${label} (${confessionId})`,
                content,
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

    if (response.status === 201) {
        const json = await response.json();
        console.log('CREATE_MESSAGE:json', json);
        return true;
    }

    console.error('CREATE_MESSAGE:fetch', response.status);
    return false;
}
