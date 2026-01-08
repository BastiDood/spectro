import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { db, disableConfessionChannel } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const SERVICE_NAME = 'webhook.interaction.lockdown';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

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

  static throwNew(): never {
    const error = new ChannelNotSetupLockdownError();
    logger.error('channel not setup for lockdown', error);
    throw error;
  }
}

/** @throws {ChannelNotSetupLockdownError} */
async function disableConfessions(disabledAt: Date, channelId: Snowflake) {
  return await tracer.asyncSpan('disable-confessions', async span => {
    span.setAttribute('channel.id', channelId);

    if (await disableConfessionChannel(db, BigInt(channelId), disabledAt)) {
      logger.info('confessions disabled', { 'channel.id': channelId });
      return;
    }

    ChannelNotSetupLockdownError.throwNew();
  });
}

export async function handleLockdown(disabledAt: Date, channelId: Snowflake) {
  try {
    await disableConfessions(disabledAt, channelId);
    return 'Confessions have been temporarily disabled for this channel.';
  } catch (error) {
    if (error instanceof LockdownError) return error.message;
    throw error;
  }
}
