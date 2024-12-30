import assert, { strictEqual } from 'node:assert/strict';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';

import { MalformedCustomIdFormat } from './errors';
import { hasAllPermissions } from './util';

import { constructAttachmentField, dispatchConfessionViaHttp } from '$lib/server/api/discord';
import { DiscordErrorCode } from '$lib/server/models/discord/error';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';

import { channel, confession } from '$lib/server/database/models';
import { eq } from 'drizzle-orm';

import { Embed, EmbedType } from '$lib/server/models/discord/embed';
import type { Attachment } from '$lib/server/models/discord/attachment';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';

abstract class ApprovalError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ApprovalError';
    }
}

class InsufficientPermissionsApprovalError extends ApprovalError {
    constructor() {
        super('You need the **"Manage Messages"** permission to approve/reject confessions.');
        this.name = 'InsufficientPermissionsApprovalError';
    }
}

class DisabledChannelConfessError extends ApprovalError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`The confession channel has been temporarily disabled since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelConfessError';
    }
}

class AlreadyApprovedApprovalError extends ApprovalError {
    constructor(public timestamp: Date) {
        super(`This confession has already been approved since since <t:${timestamp}:R>.`);
        this.name = 'AlreadyApprovedApprovalError';
    }
}

/**
 * @throws {InsufficientPermissionsApprovalError}
 * @throws {DisabledChannelConfessError}
 * @throws {AlreadyApprovedApprovalError}
 */
async function submitVerdict(
    db: Database,
    logger: Logger,
    timestamp: Date,
    isApproved: boolean,
    internalId: bigint,
    moderatorId: Snowflake,
    permissions: bigint,
): Promise<Embed | string> {
    if (!hasAllPermissions(permissions, MANAGE_MESSAGES)) throw new InsufficientPermissionsApprovalError();

    return await db.transaction(async tx => {
        const [details, ...rest] = await tx
            .select({
                disabledAt: channel.disabledAt,
                label: channel.label,
                color: channel.color,
                parentMessageId: confession.parentMessageId,
                confessionChannelId: confession.channelId,
                confessionId: confession.confessionId,
                authorId: confession.authorId,
                createdAt: confession.createdAt,
                approvedAt: confession.approvedAt,
                content: confession.content,
                attachmentUrl: confession.attachmentUrl,
                attachmentFilename: confession.attachmentFilename,
                attachmentType: confession.attachmentType,
            })
            .from(confession)
            .innerJoin(channel, eq(confession.channelId, channel.id))
            .where(eq(confession.internalId, internalId))
            .limit(1)
            .for('update');
        strictEqual(rest.length, 0);
        assert(typeof details !== 'undefined');
        const {
            approvedAt,
            createdAt,
            disabledAt,
            authorId,
            confessionChannelId,
            confessionId,
            parentMessageId,
            color,
            label,
            content,
            attachmentUrl,
            attachmentFilename,
            attachmentType,
        } = details;
        const hex = color === null ? undefined : Number.parseInt(color, 2);

        let attachment: Attachment | null = null;

        // check if an attachment exists and reconstruct it
        if (attachmentUrl && attachmentFilename) {
            attachment = {
                filename: attachmentFilename,
                url: attachmentUrl,
                content_type: attachmentType,
            };
        }

        const child = logger.child({ details });
        child.info('fetched confession details for approval');

        if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelConfessError(disabledAt);

        if (approvedAt !== null) throw new AlreadyApprovedApprovalError(approvedAt);

        if (isApproved) {
            const { rowCount } = await tx
                .update(confession)
                .set({ approvedAt: timestamp })
                .where(eq(confession.internalId, internalId));
            strictEqual(rowCount, 1);

            const discordErrorCode = await dispatchConfessionViaHttp(
                logger,
                createdAt,
                confessionChannelId,
                confessionId,
                label,
                hex,
                content,
                parentMessageId,
                attachment,
            );

            if (typeof discordErrorCode === 'number')
                switch (discordErrorCode) {
                    case DiscordErrorCode.UnknownChannel:
                        logger.error('confession channel no longer exists');
                        return `${label} #${confessionId} has been approved internally, but the confession channel no longer exists.`;
                    case DiscordErrorCode.MissingAccess:
                        logger.warn('insufficient channel permissions for the confession channel');
                        return `${label} #${confessionId} has been approved internally, but Spectro does not have the permission to send messages to the confession channel. The confession can be resent once this has been resolved.`;
                    default:
                        logger.fatal(
                            { discordErrorCode },
                            'unexpected error code when publishing to the confession channel',
                        );
                        return `${label} #${confessionId} has been approved internally, but Spectro encountered an unexpected error (${discordErrorCode}) from Discord while publishing to the confession channel. Kindly inform the developers and the moderators about this issue.`;
                }

            const fields = [
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
            ];

            if (attachment) {
                fields.push(constructAttachmentField(attachment));
            }

            return {
                type: EmbedType.Rich,
                title: `${label} #${confessionId}`,
                color: Color.Success,
                timestamp,
                description: content,
                footer: {
                    text: 'Spectro Logs',
                    icon_url: APP_ICON_URL,
                },
                fields,
            };
        }

        const fields = [
            {
                name: 'Authored by',
                value: `||<@${authorId}>||`,
                inline: true,
            },
            {
                name: 'Deleted by',
                value: `<@${moderatorId}>`,
                inline: true,
            },
        ];

        if (attachment) {
            fields.push(constructAttachmentField(attachment));
        }

        await tx.delete(confession).where(eq(confession.internalId, internalId));
        logger.warn('deleted confession due to rejection');
        return {
            type: EmbedType.Rich,
            title: `${label} #${confessionId}`,
            color: Color.Failure,
            timestamp,
            description: content,
            footer: {
                text: 'Spectro Logs',
                icon_url: APP_ICON_URL,
            },
            fields,
        };
    });
}

export async function handleApproval(
    db: Database,
    logger: Logger,
    timestamp: Date,
    customId: string,
    userId: Snowflake,
    permissions: bigint,
): Promise<InteractionResponse> {
    const [key, id, ...rest] = customId.split(':');
    strictEqual(rest.length, 0);
    assert(typeof id !== 'undefined');
    const internalId = BigInt(id);
    assert(typeof key !== 'undefined');

    // eslint-disable-next-line init-declarations
    let isApproved: boolean;
    switch (key) {
        case 'publish':
            isApproved = true;
            break;
        case 'delete':
            isApproved = false;
            break;
        default:
            throw new MalformedCustomIdFormat(key);
    }

    try {
        const payload = await submitVerdict(db, logger, timestamp, isApproved, internalId, userId, permissions);
        return typeof payload === 'string'
            ? {
                  type: InteractionResponseType.ChannelMessageWithSource,
                  data: { flags: MessageFlags.Ephemeral, content: payload },
              }
            : { type: InteractionResponseType.UpdateMessage, data: { components: [], embeds: [payload] } };
    } catch (err) {
        if (err instanceof ApprovalError) {
            logger.error(err, err.message);
            return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: { flags: MessageFlags.Ephemeral, content: err.message },
            };
        }
        throw err;
    }
}
