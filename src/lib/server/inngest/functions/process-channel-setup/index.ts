import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import { DiscordClient } from '$lib/server/api/discord';
import { db } from '$lib/server/database';
import { channel, type NewChannel } from '$lib/server/database/models';
import { inngest } from '$lib/server/inngest/client';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ChannelSetupEvent } from './schema';
import { assertSingle } from '$lib/assert';

const SERVICE_NAME = 'inngest.process-channel-setup';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);
const HEX_COLOR = /^[0-9a-f]{6}$/iu;

export const processChannelSetup = inngest.createFunction(
  {
    id: 'discord/interaction.process-channel-setup',
    name: 'Process Channel Setup',
    triggers: ChannelSetupEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-channel-setup-function', async span => {
      const { data } = event;
      const { applicationId, interactionToken } = data;

      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'channel.id': data.channelId,
        'guild.id': data.guildId,
        'log.channel.id': data.logChannelId,
      });

      const content = await step.run({ id: 'process-setup', name: 'Process Setup' }, async () => {
        const insert: NewChannel = {
          id: BigInt(data.channelId),
          guildId: BigInt(data.guildId),
          logChannelId: BigInt(data.logChannelId),
          disabledAt: null,
        };

        const set: PgUpdateSetSource<typeof channel> = {
          logChannelId: sql`excluded.${sql.raw(channel.logChannelId.name)}`,
          disabledAt: sql`excluded.${sql.raw(channel.disabledAt.name)}`,
        };

        if (data.color !== null) {
          if (!HEX_COLOR.test(data.color))
            return `\`${data.color}\` is not a valid hex-encoded RGB value.`;
          insert.color = Number.parseInt(data.color, 16).toString(2).padStart(24, '0');
          set.color = sql`excluded.${sql.raw(channel.color.name)}`;
        }

        if (data.label !== null) {
          insert.label = data.label;
          set.label = sql`excluded.${sql.raw(channel.label.name)}`;
        }

        if (data.isApprovalRequired !== null) {
          insert.isApprovalRequired = data.isApprovalRequired;
          set.isApprovalRequired = sql`excluded.${sql.raw(channel.isApprovalRequired.name)}`;
        }

        const configured = await db
          .insert(channel)
          .values(insert)
          .onConflictDoUpdate({ target: channel.id, set })
          .returning({ label: channel.label, isApprovalRequired: channel.isApprovalRequired })
          .then(assertSingle);
        logger.info('confessions enabled');

        return configured.isApprovalRequired
          ? `Only approved confessions (labelled **${configured.label}**) are now enabled for this channel.`
          : `Any confessions (labelled **${configured.label}**) are now enabled for this channel.`;
      });

      await step.run(
        { id: 'edit-original-interaction-response', name: 'Edit Original Interaction Response' },
        async () => {
          try {
            await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
              content,
            });
          } catch (cause) {
            if (cause instanceof DiscordError)
              switch (cause.code) {
                case DiscordErrorCode.UnknownWebhook:
                case DiscordErrorCode.InvalidWebhookToken: {
                  const wrapped = new NonRetriableError(
                    'discord rejected original interaction response edit',
                    { cause },
                  );
                  logger.error('discord rejected original interaction response edit', wrapped, {
                    'discord.error.code': cause.code,
                    'discord.error.message': cause.message,
                  });
                  throw wrapped;
                }
                default:
                  break;
              }
            throw cause;
          }
        },
      );
    }),
);
