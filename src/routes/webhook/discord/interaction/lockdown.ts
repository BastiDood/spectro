import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { channel } from '$lib/server/database/models';
import { eq } from 'drizzle-orm';
import { excludesMask } from './util';

import { MANAGE_CHANNELS } from '$lib/server/models/discord/permission';

abstract class LockdownError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'LockdownError';
    }
}

class InsufficientPermissionError extends LockdownError {
    constructor() {
        super('You need the "Manage Channels" permission to disable confessions for this channel.');
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
    logger: Logger,
    disabledAt: Date,
    channelId: Snowflake,
    permissions: bigint,
) {
    if (excludesMask(permissions, MANAGE_CHANNELS)) throw new InsufficientPermissionError();

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

    logger.info('confessions disabled');
}

export async function handleLockdown(
    db: Database,
    logger: Logger,
    disabledAt: Date,
    channelId: Snowflake,
    permissions: Snowflake,
) {
    try {
        await disableConfessions(db, logger, disabledAt, channelId, permissions);
        return 'Confessions have been temporarily disabled for this channel.';
    } catch (err) {
        if (err instanceof LockdownError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
