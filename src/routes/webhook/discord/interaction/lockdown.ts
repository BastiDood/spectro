import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { db, disableConfessionChannel } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const SERVICE_NAME = 'webhook.interaction.lockdown';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

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
async function disableConfessions(disabledAt: Date, channelId: Snowflake) {
  return await tracer.asyncSpan('disable-confessions', async span => {
    span.setAttribute('channel.id', channelId.toString());

    if (await disableConfessionChannel(db, channelId, disabledAt)) {
      logger.info('confessions disabled', { 'channel.id': channelId.toString() });
      return;
    }
    throw new ChannelNotSetupLockdownError();
  });
}

export async function handleLockdown(disabledAt: Date, channelId: Snowflake) {
  try {
    await disableConfessions(disabledAt, channelId);
    return 'Confessions have been temporarily disabled for this channel.';
  } catch (err) {
    if (err instanceof LockdownError) {
      logger.error(err.message, err);
      return err.message;
    }
    throw err;
  }
}
