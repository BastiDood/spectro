import { db } from '#lib/server/database/index.ts';
import { guild } from '#lib/server/database/models/index.ts';
import type { Snowflake } from '#lib/server/models/discord/snowflake.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

const SERVICE_NAME = 'webhook.event.application-authorized';
const tracer = Tracer.byName(SERVICE_NAME);

export async function handleApplicationAuthorized(createdAt: Date, guildId: Snowflake) {
  await tracer.asyncSpan('handle-application-authorized', async span => {
    span.setAttribute('spectro.discord.guild.id', guildId);
    await tracer.asyncSpan('insert-guild', async span => {
      span.setAttribute('spectro.discord.guild.id', guildId);
      const { rowCount } = await db
        .insert(guild)
        .values({ id: BigInt(guildId), createdAt })
        .onConflictDoNothing({ target: guild.id });
      if (rowCount !== null) span.setAttribute('spectro.database.affected_row_count', rowCount);
    });
  });
}
