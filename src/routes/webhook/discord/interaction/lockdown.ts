import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { channel } from '$lib/server/database/models';
import { eq } from 'drizzle-orm';

abstract class LockdownError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'LockdownError';
    }
}

class InsufficientPermissionError extends LockdownError {
    constructor() {
        super('You do not have the permission to disable confessions for this channel.');
        this.name = 'InsufficientPermissionError';
    }
}

class MissingRowCountError extends LockdownError {
    constructor() {
        super('An update operation did not return the number of affected rows. Please report this bug.');
        this.name = 'MissingRowCountError';
    }
}

class UnexpectedRowCountError extends LockdownError {
    constructor(public count: number) {
        super(`An unexpected number of rows (${count}) were returned when updating channels. Please report this bug.`);
        this.name = 'UnexpectedRowCountError';
    }
}

class ChannelNotSetupError extends LockdownError {
    constructor() {
        super('This has not yet been set up for confessions.');
        this.name = 'ChannelNotSetupError';
    }
}

/**
 * @throws {InsufficientPermissionError}
 * @throws {MissingRowCountError}
 * @throws {UnexpectedRowCountError}
 * @throws {ChannelNotSetupError}
 */
async function disableConfessions(
    db: Database,
    disabledAt: Date,
    guildId: Snowflake,
    channelId: Snowflake,
    guildOwnerId: Snowflake,
    userId: Snowflake,
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

    const { rowCount } = await db.update(channel).set({ disabledAt }).where(eq(channel.id, channelId));
    switch (rowCount) {
        case null:
            throw new MissingRowCountError();
        case 0:
            throw new ChannelNotSetupError();
        case 1:
            break;
        default:
            throw new UnexpectedRowCountError(rowCount);
    }
}

export async function handleLockdown(
    db: Database,
    disabledAt: Date,
    guildId: Snowflake,
    channelId: Snowflake,
    guildOwnerId: Snowflake,
    userId: Snowflake,
) {
    try {
        await disableConfessions(db, disabledAt, guildId, channelId, guildOwnerId, userId);
        return `Confessions have been temporarily disabled for <#${channelId}>.`;
    } catch (err) {
        if (err instanceof LockdownError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
