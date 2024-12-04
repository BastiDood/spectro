import assert from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { permission } from '$lib/server/database/models/app';
import { sql } from 'drizzle-orm';

export async function handleApplicationAuthorized(db: Database, logger: Logger, guildId: Snowflake, userId: Snowflake) {
    const { rowCount } = await db
        .insert(permission)
        .values({ guildId, userId, isAdmin: true })
        .onConflictDoUpdate({
            target: [permission.userId, permission.guildId],
            set: { isAdmin: sql`excluded.${sql.raw(permission.isAdmin.name)}` },
        });
    assert(rowCount !== null);
    logger.info({ guildId, userId, insertedOrUpdatedPermissions: rowCount }, 'application authorized');
}
