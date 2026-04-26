import assert from 'node:assert/strict';

import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import * as schema from '$lib/server/database/models';
import { assertOptional } from '$lib/assert';
import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { db, type SerializedConfessionForDispatch } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionApprovalEvent } from './schema';

const SERVICE_NAME = 'inngest.dispatch-approval';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export const dispatchApproval = inngest.createFunction(
  {
    id: 'discord/interaction.approve',
    name: 'Dispatch Approved Confession',
    triggers: ConfessionApprovalEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('dispatch-approval-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
      });

      const confession = await step.run(
        { id: 'load-approved-confession', name: 'Load Approved Confession' },
        async (): Promise<SerializedConfessionForDispatch> => {
          const result = await db
            .select({
              confessionId: schema.confession.confessionId,
              channelId: schema.confession.channelId,
              content: schema.confession.content,
              createdAt: schema.confession.createdAt,
              approvedAt: schema.confession.approvedAt,
              parentMessageId: schema.confession.parentMessageId,
              channelLabel: schema.channel.label,
              channelColor: schema.channel.color,
              ephemeralAttachmentId: schema.ephemeralAttachment.id,
              durableAttachmentId: schema.durableAttachment.id,
              attachmentFilename: schema.durableAttachment.filename,
              attachmentContentType: schema.durableAttachment.contentType,
              attachmentUrl: schema.durableAttachment.url,
              attachmentProxyUrl: schema.durableAttachment.proxyUrl,
              attachmentHeight: schema.durableAttachment.height,
              attachmentWidth: schema.durableAttachment.width,
            })
            .from(schema.confession)
            .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
            .leftJoin(
              schema.ephemeralAttachment,
              eq(schema.confession.internalId, schema.ephemeralAttachment.confessionInternalId),
            )
            .leftJoin(
              schema.durableAttachment,
              eq(schema.ephemeralAttachment.id, schema.durableAttachment.ephemeralAttachmentId),
            )
            .where(eq(schema.confession.internalId, BigInt(event.data.internalId)))
            .limit(1)
            .then(assertOptional);

          if (typeof result === 'undefined') {
            const error = new NonRetriableError('confession not found');
            logger.fatal('confession not found for dispatch', error);
            throw error;
          }

          if (result.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.fatal('confession not approved for dispatch', error);
            throw error;
          }

          let attachment: SerializedConfessionForDispatch['attachment'] = null;
          if (result.ephemeralAttachmentId !== null) {
            assert(result.durableAttachmentId !== null);
            assert(result.attachmentFilename !== null);
            assert(result.attachmentUrl !== null);
            assert(result.attachmentProxyUrl !== null);
            attachment = {
              id: result.durableAttachmentId.toString(),
              filename: result.attachmentFilename,
              contentType: result.attachmentContentType,
              url: result.attachmentUrl,
              proxyUrl: result.attachmentProxyUrl,
              height: result.attachmentHeight,
              width: result.attachmentWidth,
            };
          }

          const confession = {
            confessionId: result.confessionId.toString(),
            channelId: result.channelId.toString(),
            content: result.content,
            createdAt: result.createdAt.toISOString(),
            approvedAt: result.approvedAt.toISOString(),
            parentMessageId: result.parentMessageId?.toString() ?? null,
            channel: {
              label: result.channelLabel,
              color: result.channelColor,
            },
            attachment,
          } satisfies SerializedConfessionForDispatch;

          logger.debug('fetched confession', {
            'confession.created': confession.createdAt,
            'confession.approved': confession.approvedAt,
            'confession.id': confession.confessionId,
            'confession.channel.id': confession.channelId,
            'confession.parent.message.id': confession.parentMessageId,
          });

          return confession;
        },
      );

      const result = await step.run(
        { id: 'dispatch-approval', name: 'Dispatch Approved Confession' },
        async () =>
          await tracer.asyncSpan('dispatch-approval-step', async () => {
            try {
              const message = await DiscordClient.ENV.createMessage(
                confession.channelId,
                createConfessionPayload(confession),
                `${event.id}:approval`,
              );

              logger.info('approved confession dispatched', {
                confessionId: confession.confessionId,
              });

              logger.trace('approved confession dispatched', {
                'discord.message.id': message.id,
                'discord.channel.id': message.channel_id,
                'discord.message.timestamp': message.timestamp,
              });
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.InvalidFormBody: {
                    const wrapped = new NonRetriableError(
                      'discord rejected createMessage nonce payload',
                      { cause: error },
                    );
                    logger.error('discord nonce validation failed in dispatch-approval', wrapped, {
                      'discord.error.code': error.code,
                      'discord.error.message': error.message,
                    });
                    throw wrapped;
                  }
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Confession,
                      status: 'approved internally',
                    });
                  default:
                    break;
                }
              throw error;
            }
          }),
      );

      if (result === null) return;

      await step.run({ id: 'send-failure-follow-up', name: 'Send Failure Follow-up' }, async () => {
        try {
          const message = await DiscordClient.createFollowupMessage(
            event.data.applicationId,
            event.data.interactionToken,
            {
              content: result,
              flags: MessageFlags.Ephemeral,
            },
          );
          logger.info('failure follow-up sent', {
            'discord.message.id': message.id,
            'discord.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
        } catch (cause) {
          if (cause instanceof DiscordError)
            switch (cause.code) {
              case DiscordErrorCode.UnknownWebhook:
              case DiscordErrorCode.InvalidWebhookToken: {
                const wrapped = new NonRetriableError(
                  'discord rejected approval failure follow-up',
                  { cause },
                );
                logger.error('discord rejected approval failure follow-up', wrapped, {
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
      });
    }),
);
