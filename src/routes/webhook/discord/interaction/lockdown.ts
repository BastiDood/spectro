import type { Logger } from 'pino';

import { db, disableConfessionChannel } from '$lib/server/database';

import type { Snowflake } from '$lib/server/models/discord/snowflake';

abstract class LockdownError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'LockdownError';
  }
}

class ChannelNotSetupLockdownError extends LockdownError {
  constructor() {
    super('This has not yet been set up for confessions.');
    this.name = 'ChannelNotSetupLockdownError';
  }
}

/** @throws {ChannelNotSetupLockdownError} */
async function disableConfessions(logger: Logger, disabledAt: Date, channelId: Snowflake) {
  if (await disableConfessionChannel(db, channelId, disabledAt)) {
    logger.info('confessions disabled');
    return;
  }
  throw new ChannelNotSetupLockdownError();
}

export async function handleLockdown(logger: Logger, disabledAt: Date, channelId: Snowflake) {
  try {
    await disableConfessions(logger, disabledAt, channelId);
    return 'Confessions have been temporarily disabled for this channel.';
  } catch (err) {
    if (err instanceof LockdownError) {
      logger.error(err, err.message);
      return err.message;
    }
    throw err;
  }
}
