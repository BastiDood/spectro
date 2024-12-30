import { APP_ICON_URL, Color } from '$lib/server/constants';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import type { Logger } from 'pino';

import { EmbedImage, EmbedType } from '$lib/server/models/discord/embed';
import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import type { Attachment } from '../models/discord/attachment';
import { DiscordError } from '$lib/server/models/discord/error';
import { parse } from 'valibot';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

async function createMessage(
    logger: Logger,
    channelId: Snowflake,
    data: CreateMessage,
    botToken: string,
) {
    const payload = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));
    const formData = new FormData();
    formData.append('payload_json', payload);

    const start = performance.now();
    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
        body: formData,
        method: 'POST',
        headers: {
            Authorization: `Bot ${botToken}`,
        },
    });
    const json = await response.json();
    const createMessageTimeMillis = performance.now() - start;
    const child = logger.child({ createMessageTimeMillis });

    if (response.status === 200) {
        const parsed = parse(Message, json);
        child.info({ createMessage: parsed });
        return parsed;
    }

    const { code, message } = parse(DiscordError, json);
    child.error({ statusCode: response.status }, message);
    return code;
}

function constructAttachmentField(attachment: Attachment) {
    const contentIdentifier = attachment.content_type?.split("/")[0] ?? "file";
    const attachmentInfo = attachment.url;

    return {
        name: `${contentIdentifier[0]?.toUpperCase().concat(contentIdentifier.substring(1))} Attachment`,
        value: attachmentInfo,
        inline: true
    }
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
    attachment: Attachment | null,
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

    if (attachment) {
        if (attachment.content_type?.includes("image")) {
            const embedData: EmbedImage = {
                url: new URL(attachment.url),
                height: attachment.height,
                width: attachment.width
            };
            if (params.embeds && params.embeds[0]) {
                params.embeds[0].image = embedData as EmbedImage;
            }
            logger.info({ params }, "processing an image embed")
        }
        else {
            const attachmentField = constructAttachmentField(attachment);
            if (params.embeds && params.embeds[0]) {
                params.embeds[0].fields = [attachmentField]
            }
            logger.info({ params }, `processing some arbitrary embed of type ${attachment.content_type}`)
        }
    }

    if (replyToMessageId !== null)
        params.message_reference = {
            type: MessageReferenceType.Default,
            message_id: replyToMessageId,
            fail_if_not_exists: false,
        };

    return await createMessage(logger, channelId, params, botToken, attachment);
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
    attachment: Attachment | null,
    botToken = DISCORD_BOT_TOKEN,
) {
    const customId = internalId.toString();
    const fields = [
        {
            name: 'Authored by',
            value: `||<@${authorId}>||`,
            inline: true,
        },
    ];
    if (attachment) {
        fields.push(constructAttachmentField(attachment))
    }
    return await createMessage(
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
                    fields
                },
            ],
            components: [
                {
                    type: MessageComponentType.ActionRow,
                    components: [
                        {
                            type: MessageComponentType.Button,
                            style: MessageComponentButtonStyle.Success,
                            label: 'Publish',
                            emoji: { name: '\u{2712}\u{fe0f}' },
                            custom_id: `publish:${customId}`,
                        },
                        {
                            type: MessageComponentType.Button,
                            style: MessageComponentButtonStyle.Danger,
                            label: 'Delete',
                            emoji: { name: '\u{1f5d1}\u{fe0f}' },
                            custom_id: `delete:${customId}`,
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
    attachment: Attachment | null,
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
                    fields
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
    return await createMessage(
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

async function createInteractionResponse(
    logger: Logger,
    interactionId: Snowflake,
    interactionToken: string,
    data: InteractionResponse,
    botToken: string,
) {
    const body = JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value));

    const start = performance.now();
    const response = await fetch(`${DISCORD_API_BASE_URL}/interactions/${interactionId}/${interactionToken}/callback`, {
        body,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bot ${botToken}`,
        },
    });
    const createInteractionResponseTimeMillis = performance.now() - start;
    const child = logger.child({ createInteractionResponseTimeMillis });

    if (response.status === 204) {
        child.info('interaction response created');
        return null;
    }

    const json = await response.json();
    const { code, message } = parse(DiscordError, json);
    child.error({ statusCode: response.status }, message);
    return code;
}

export async function deferResponse(
    logger: Logger,
    interactionId: Snowflake,
    interactionToken: string,
    botToken = DISCORD_BOT_TOKEN,
) {
    return await createInteractionResponse(
        logger,
        interactionId,
        interactionToken,
        { type: InteractionResponseType.DeferredChannelMessageWithSource, data: { flags: MessageFlags.Ephemeral } },
        botToken,
    );
}
