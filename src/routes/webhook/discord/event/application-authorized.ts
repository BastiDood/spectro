import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { guild } from '$lib/server/database/models';

export async function handleApplicationAuthorized(db: Database, logger: Logger, createdAt: Date, guildId: Snowflake) {
    const { rowCount } = await db
        .insert(guild)
        .values({ id: guildId, createdAt })
        .onConflictDoNothing({ target: guild.id });
    logger.info({ rowCount }, 'application authorized');
}
