import { APP_ICON_URL, Color } from '$lib/server/constants';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import type { Logger } from 'pino';

import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { EmbedType } from '$lib/server/models/discord/embed';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { DiscordError } from '$lib/server/models/discord/error';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

async function sendMessage(logger: Logger, channelId: Snowflake, data: CreateMessage, botToken: string) {
    const body = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));

    const start = performance.now();
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
    const sendMessageTimeMillis = performance.now() - start;
    logger.info({ sendMessageTimeMillis });

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
    timestamp: Date,
    channelId: Snowflake,
    confessionId: bigint,
    label: string,
    color: number | undefined,
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

export interface ExternalChannelReference {
    channelId: bigint;
    messageId: bigint;
}

export async function logPendingConfessionViaHttp(
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    internalId: bigint,
    confessionId: bigint,
    authorId: Snowflake,
    label: string,
    description: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    const customId = internalId.toString();
    return await sendMessage(
        logger,
        channelId,
        {
            flags: MessageFlags.SuppressNotifications,
            allowed_mentions: { parse: [AllowedMentionType.Users] },
            embeds: [
                {
                    type: EmbedType.Rich,
                    title: `${label} #${confessionId}`,
                    color: Color.Pending,
                    timestamp,
                    description,
                    footer: {
                        text: 'Spectro Logs',
                        icon_url: APP_ICON_URL,
                    },
                    fields: [
                        {
                            name: 'Authored by',
                            value: `||<@${authorId}>||`,
                            inline: true,
                        },
                    ],
                },
            ],
            components: [
                {
                    type: MessageComponentType.ActionRow,
                    components: [
                        {
                            type: MessageComponentType.Button,
                            style: MessageComponentButtonStyle.Success,
                            emoji: { id: null, name: '️🖊️' },
                            label: 'Publish',
                            custom_id: customId,
                        },
                        {
                            type: MessageComponentType.Button,
                            style: MessageComponentButtonStyle.Danger,
                            emoji: { id: null, name: '🗑️' },
                            label: 'Delete',
                            custom_id: customId,
                        },
                    ],
                },
            ],
        },
        botToken,
    );
}

export async function logApprovedConfessionViaHttp(
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    confessionId: bigint,
    authorId: Snowflake,
    label: string,
    description: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    return await sendMessage(
        logger,
        channelId,
        {
            flags: MessageFlags.SuppressNotifications,
            allowed_mentions: { parse: [AllowedMentionType.Users] },
            embeds: [
                {
                    type: EmbedType.Rich,
                    title: `${label} #${confessionId}`,
                    color: Color.Success,
                    timestamp,
                    description,
                    footer: {
                        text: 'Spectro Logs',
                        icon_url: APP_ICON_URL,
                    },
                    fields: [
                        {
                            name: 'Authored by',
                            value: `||<@${authorId}>||`,
                            inline: true,
                        },
                    ],
                },
            ],
        },
        botToken,
    );
}

export async function logResentConfessionViaHttp(
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    confessionId: bigint,
    authorId: Snowflake,
    moderatorId: Snowflake,
    label: string,
    description: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    return await sendMessage(
        logger,
        channelId,
        {
            flags: MessageFlags.SuppressNotifications,
            allowed_mentions: { parse: [AllowedMentionType.Users] },
            embeds: [
                {
                    type: EmbedType.Rich,
                    title: `${label} #${confessionId}`,
                    color: Color.Replay,
                    timestamp,
                    description,
                    footer: {
                        text: 'Spectro Logs',
                        icon_url: APP_ICON_URL,
                    },
                    fields: [
                        {
                            name: 'Authored by',
                            value: `||<@${authorId}>||`,
                            inline: true,
                        },
                        {
                            name: 'Resent by',
                            value: `<@${moderatorId}>`,
                            inline: true,
                        },
                    ],
                },
            ],
        },
        botToken,
    );
}

async function editMessage(
    logger: Logger,
    channelId: Snowflake,
    messageId: Snowflake,
    data: Partial<CreateMessage>,
    botToken: string,
) {
    const body = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));

    const start = performance.now();
    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages/${messageId}`, {
        body,
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length.toString(),
            Authorization: `Bot ${botToken}`,
        },
    });
    const json = await response.json();
    const editMessageTimeMillis = performance.now() - start;
    logger.info({ editMessageTimeMillis });

    if (response.status === 200) {
        logger.info({ createMessage: json });
        return parse(Message, json);
    }

    logger.error({ statusCode: response.status, discordError: json }, 'message edit failed');
    const { code, message } = parse(DiscordError, json);
    logger.error({ editMessageError: message });
    return code;
}

export async function approveConfessionLog(
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    messageId: Snowflake,
    label: string,
    confessionId: bigint,
    authorId: Snowflake,
    moderatorId: Snowflake,
    description: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    return await editMessage(
        logger,
        channelId,
        messageId,
        {
            embeds: [
                {
                    type: EmbedType.Rich,
                    title: `${label} #${confessionId}`,
                    color: Color.Success,
                    timestamp,
                    description,
                    footer: {
                        text: 'Spectro Logs',
                        icon_url: APP_ICON_URL,
                    },
                    fields: [
                        {
                            name: 'Authored by',
                            value: `||<@${authorId}>||`,
                            inline: true,
                        },
                        {
                            name: 'Approved by',
                            value: `<@${moderatorId}>`,
                            inline: true,
                        },
                    ],
                },
            ],
        },
        botToken,
    );
}

export async function rejectConfessionLog(
    logger: Logger,
    timestamp: Date,
    logChannelId: Snowflake,
    logMessageId: Snowflake,
    label: string,
    confessionId: bigint,
    authorId: Snowflake,
    moderatorId: Snowflake,
    description: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    return await editMessage(
        logger,
        logChannelId,
        logMessageId,
        {
            embeds: [
                {
                    type: EmbedType.Rich,
                    title: `${label} #${confessionId}`,
                    color: Color.Failure,
                    timestamp,
                    description,
                    footer: {
                        text: 'Spectro Logs',
                        icon_url: APP_ICON_URL,
                    },
                    fields: [
                        {
                            name: 'Rejected by',
                            value: `||<@${authorId}>||`,
                            inline: true,
                        },
                        {
                            name: 'Deleted by',
                            value: `<@${moderatorId}>`,
                            inline: true,
                        },
                    ],
                },
            ],
        },
        botToken,
    );
}
