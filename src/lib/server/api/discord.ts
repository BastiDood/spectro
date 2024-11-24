import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { EmbedType, type RichEmbed } from '$lib/server/models/discord/interaction';
import { IncomingWebhook } from '$lib/server/models/discord/webhook';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export async function createWebhook(channelId: Snowflake, name: string, avatar?: string, botToken = DISCORD_BOT_TOKEN) {
    const body = JSON.stringify({ name, avatar });
    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/webhooks`, {
        body,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length.toString(),
            Authorization: `Bot ${botToken}`,
        },
    });

    if (response.status !== 201) {
        console.error('CREATE_WEBHOOK:fetch', response.status);
        return null;
    }

    const json = await response.json();
    console.debug('CREATE_WEBHOOK:json', json);
    return parse(IncomingWebhook, json);
}

export async function dispatchConfessionViaWebhook(
    webhookId: Snowflake,
    webhookToken: string,
    confessionId: bigint,
    confessionLabel: string,
    timestamp: Date,
    content: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    const body = JSON.stringify({
        embeds: [
            {
                type: EmbedType.Rich,
                title: `${confessionLabel} (${confessionId})`,
                content,
                timestamp,
            } satisfies RichEmbed,
        ],
    });

    const response = await fetch(`${DISCORD_API_BASE_URL}/webhooks/${webhookId}/${webhookToken}`, {
        body,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length.toString(),
            Authorization: `Bot ${botToken}`,
        },
    });

    if (response.ok) {
        const json = await response.json();
        console.log('EXECUTE_WEBHOOK:json', json);
        return true;
    }

    // TODO: Check the response code for errors.
    console.error('EXECUTE_WEBHOOK:fetch', response.status);
    return false;
}
