import type { Logger } from 'pino';

import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { db } from '$lib/server/database';
import { guild } from '$lib/server/database/models';

export async function handleApplicationAuthorized(
  logger: Logger,
  createdAt: Date,
  guildId: Snowflake,
) {
  const { rowCount } = await db
    .insert(guild)
    .values({ id: guildId, createdAt })
    .onConflictDoNothing({ target: guild.id });
  logger.info({ rowCount }, 'application authorized');
}
