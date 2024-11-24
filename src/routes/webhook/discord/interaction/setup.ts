import type { Database } from '$lib/server/database';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { channel } from '$lib/server/database/models';
import { sql } from 'drizzle-orm';

import {
    type ApplicationCommandDataOption,
    ApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import assert, { fail, strictEqual } from 'node:assert/strict';

abstract class SetupError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'SetupError';
    }
}

class InsufficientPermissionError extends SetupError {
    constructor() {
        super('You do not have the permission to set up confessions for this channel.');
        this.name = 'InsufficientPermissionError';
    }
}

class MissingRowCountError extends SetupError {
    constructor() {
        super('An update operation did not return the number of affected rows. Please report this bug.');
        this.name = 'MissingRowCountError';
    }
}

class UnexpectedRowCountError extends SetupError {
    constructor(public count: number) {
        super(`An unexpected number of rows (${count}) were returned when updating channels. Please report this bug.`);
        this.name = 'UnexpectedRowCountError';
    }
}

/**
 * @throws {InsufficientPermissionError}
 * @throws {MissingRowCountError}
 * @throws {UnexpectedRowCountError}
 */
async function enableConfessions(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    guildOwnerId: Snowflake,
    userId: Snowflake,
    label?: string,
    isApprovalRequired?: boolean,
) {
    if (guildOwnerId !== userId) {
        const permission = await db.query.permission.findFirst({
            columns: {},
            where(table, { and, eq }) {
                return and(eq(table.guildId, guildId), eq(table.userId, userId));
            },
        });

        // No need to check `is_admin` because this command only requires moderator privileges.
        if (typeof permission === 'undefined') throw new InsufficientPermissionError();
    }

    const set: PgUpdateSetSource<typeof channel> = { disabledAt: sql`excluded.${sql.raw(channel.disabledAt.name)}` };
    if (typeof label !== 'undefined') set.label = sql`excluded.${sql.raw(channel.label.name)}`;
    if (typeof isApprovalRequired !== 'undefined')
        set.isApprovalRequired = sql`excluded.${sql.raw(channel.isApprovalRequired.name)}`;

    const { rowCount } = await db
        .insert(channel)
        .values({ id: channelId, guildId, label, isApprovalRequired, disabledAt: null })
        .onConflictDoUpdate({ target: [channel.guildId, channel.id], set });
    switch (rowCount) {
        case null:
            throw new MissingRowCountError();
        case 1:
            break;
        default:
            throw new UnexpectedRowCountError(rowCount);
    }
}

export async function handleSetup(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    guildOwnerId: Snowflake,
    userId: Snowflake,
    options: ApplicationCommandDataOption[],
) {
    let label: string | null = null;
    let isApprovalRequired: boolean | null = null;

    for (const option of options)
        switch (option.type) {
            case ApplicationCommandDataOptionType.String:
                strictEqual(option.name, 'label');
                label = option.value;
                break;
            case ApplicationCommandDataOptionType.Boolean:
                strictEqual(option.name, 'approval');
                isApprovalRequired = option.value;
                break;
            default:
                fail(`unexpected option type ${option.type} encountered`);
                break;
        }

    assert(label !== null);
    assert(isApprovalRequired !== null);

    try {
        await enableConfessions(db, guildId, channelId, guildOwnerId, userId, label, isApprovalRequired);
        return `Confessions have been set up for <#${channelId}>.`;
    } catch (err) {
        if (err instanceof SetupError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
