import { APP_ICON_URL } from '$lib/server/constants';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import type { Logger } from 'pino';

import { EmbedType } from '$lib/server/models/discord/embed';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { DiscordError } from '$lib/server/models/discord/error';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

async function sendMessage(logger: Logger, channelId: bigint, data: CreateMessage, botToken: string) {
    const body = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
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
        logger.info({ createMessage: json });
        return parse(Message, json);
    }

    logger.error({ statusCode: response.status, discordError: json }, 'message dispatch failed');
    const { code, message } = parse(DiscordError, json);
    logger.error({ sendMessageError: message });
    return code;
}

export async function dispatchConfessionViaHttp(
    logger: Logger,
    channelId: Snowflake,
    confessionId: bigint,
    label: string,
    color: number | undefined,
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
                color,
                footer: {
                    text: "Admins can access Spectro's confession logs",
                    icon_url: APP_ICON_URL,
                },
            },
        ],
    };

    if (replyToMessageId !== null)
        params.message_reference = {
            type: MessageReferenceType.Default,
            message_id: replyToMessageId,
            fail_if_not_exists: false,
        };

    return await sendMessage(logger, channelId, params, botToken);
}
