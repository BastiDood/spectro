import assert, { fail, strictEqual } from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';

import { channel } from '$lib/server/database/models';
import { sql } from 'drizzle-orm';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { MANAGE_CHANNELS } from '$lib/server/models/discord/permission';
import { excludesMask } from './util';

abstract class SetupError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'SetupError';
    }
}

class InsufficientPermissionError extends SetupError {
    constructor() {
        super('You need the "Manage Channels" permission to set up confessions for this channel.');
        this.name = 'InsufficientPermissionError';
    }
}

/** @throws {InsufficientPermissionError} */
async function enableConfessions(
    db: Database,
    logger: Logger,
    guildId: Snowflake,
    channelId: Snowflake,
    permissions: bigint,
    label: string | undefined,
    color: number | undefined,
    isApprovalRequired: boolean | undefined,
) {
    if (excludesMask(permissions, MANAGE_CHANNELS)) throw new InsufficientPermissionError();

    const set: PgUpdateSetSource<typeof channel> = { disabledAt: sql`excluded.${sql.raw(channel.disabledAt.name)}` };
    if (typeof label !== 'undefined') set.label = sql`excluded.${sql.raw(channel.label.name)}`;
    if (typeof color !== 'undefined') set.color = sql`excluded.${sql.raw(channel.color.name)}`;
    if (typeof isApprovalRequired !== 'undefined')
        set.isApprovalRequired = sql`excluded.${sql.raw(channel.isApprovalRequired.name)}`;

    const [result, ...otherResults] = await db
        .insert(channel)
        .values({
            id: channelId,
            guildId,
            label,
            isApprovalRequired,
            color: color?.toString(2).padStart(24, '0'),
            disabledAt: null,
        })
        .onConflictDoUpdate({ target: [channel.guildId, channel.id], set })
        .returning({ label: channel.label, isApprovalRequired: channel.isApprovalRequired });
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');

    logger.info('confessions enabled');
    return result;
}

const HEX_COLOR = /^[0-9a-f]{6}$/i;
export async function handleSetup(
    db: Database,
    logger: Logger,
    guildId: Snowflake,
    channelId: Snowflake,
    permissions: Snowflake,
    options: InteractionApplicationCommandChatInputOption[],
) {
    // eslint-disable-next-line init-declarations
    let label: string | undefined;
    // eslint-disable-next-line init-declarations
    let color: number | undefined;
    // eslint-disable-next-line init-declarations
    let isApprovalRequired: boolean | undefined;

    for (const option of options)
        switch (option.type) {
            case InteractionApplicationCommandChatInputOptionType.String:
                switch (option.name) {
                    case 'label':
                        label = option.value;
                        break;
                    case 'color':
                        if (HEX_COLOR.test(option.value)) color = Number.parseInt(option.value, 16);
                        else return `\`${option.value}\` is not a valid hex-encoded RGB value.`;
                        break;
                    default:
                        fail(`unexpected setup argument ${option.name}`);
                        break;
                }
                break;
            case InteractionApplicationCommandChatInputOptionType.Boolean:
                strictEqual(option.name, 'approval');
                isApprovalRequired = option.value;
                break;
            default:
                fail(`unexpected option type ${option.type} encountered`);
                break;
        }

    try {
        const result = await enableConfessions(
            db,
            logger,
            guildId,
            channelId,
            permissions,
            label,
            color,
            isApprovalRequired,
        );
        return result.isApprovalRequired
            ? `Only approved confessions (labelled **${result.label}**) are now enabled for this channel.`
            : `Any confessions (labelled **${result.label}**) are now enabled for this channel.`;
    } catch (err) {
        if (err instanceof SetupError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
