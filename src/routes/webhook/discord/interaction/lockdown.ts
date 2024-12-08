import { type Database, disableConfessionChannel } from '$lib/server/database';
import type { Logger } from 'pino';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { excludesMask } from './util';

import { MANAGE_CHANNELS } from '$lib/server/models/discord/permission';

abstract class LockdownError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'LockdownError';
    }
}

class InsufficientPermissionLockdownError extends LockdownError {
    constructor() {
        super('You need the **"Manage Channels"** permission to disable confessions for this channel.');
        this.name = 'InsufficientPermissionLockdownError';
    }
}

class ChannelNotSetupLockdownError extends LockdownError {
    constructor() {
        super('This has not yet been set up for confessions.');
        this.name = 'ChannelNotSetupLockdownError';
    }
}

/**
 * @throws {InsufficientPermissionLockdownError}
 * @throws {ChannelNotSetupLockdownError}
 */
async function disableConfessions(
    db: Database,
    logger: Logger,
    disabledAt: Date,
    channelId: Snowflake,
    permissions: bigint,
) {
    if (excludesMask(permissions, MANAGE_CHANNELS)) throw new InsufficientPermissionLockdownError();

    if (await disableConfessionChannel(db, channelId, disabledAt)) {
        logger.info('confessions disabled');
        return;
    }

    throw new ChannelNotSetupLockdownError();
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
