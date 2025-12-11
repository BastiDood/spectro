import { db } from '$lib/server/database';
import { guild } from '$lib/server/database/models';
import { Logger } from '$lib/server/telemetry/logger';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'webhook.event.application-authorized';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export async function handleApplicationAuthorized(createdAt: Date, guildId: Snowflake) {
  return await tracer.asyncSpan('handle-application-authorized', async span => {
    span.setAttribute('guild.id', guildId);
    const { rowCount } = await db
      .insert(guild)
      .values({ id: BigInt(guildId), createdAt })
      .onConflictDoNothing({ target: guild.id });
    logger.info('guild authorized application', { 'row.count': rowCount });
  });
}
