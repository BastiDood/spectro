import assert, { fail, strictEqual } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import type { Logger } from 'pino';
import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { DeserializedInteraction } from '$lib/server/models/discord/interaction';
import {
  MANAGE_CHANNELS,
  MANAGE_MESSAGES,
  SEND_MESSAGES,
} from '$lib/server/models/discord/permission';
import { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { InteractionType } from '$lib/server/models/discord/interaction/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { handleApproval } from './approval';
import { handleConfess } from './confess';
import { handleConfessSubmit } from './confess-submit';
import { handleHelp } from './help';
import { handleInfo } from './info';
import { handleLockdown } from './lockdown';
import { handleReplyModal } from './reply-modal';
import { handleReplySubmit } from './reply-submit';
import { handleResend } from './resend';
import { handleSetup } from './setup';
import { hasAllPermissions } from './util';

async function handleInteraction(
  logger: Logger, // TODO: Fine-grained database-level performance logs.
  timestamp: Date,
  interaction: DeserializedInteraction,
): Promise<InteractionResponse> {
  // eslint-disable-next-line default-case
  switch (interaction.type) {
    case InteractionType.Ping:
      return { type: InteractionResponseType.Pong };
    case InteractionType.ApplicationCommand:
      switch (interaction.data.type) {
        case InteractionApplicationCommandType.ChatInput:
          switch (interaction.data.name) {
            case 'confess':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.user !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, SEND_MESSAGES));
              return await handleConfess(
                logger,
                timestamp,
                interaction.member.permissions,
                interaction.channel_id,
                interaction.member.user.id,
                interaction.data.options ?? [],
                interaction.data.resolved ?? null,
              );
            case 'help':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleHelp(logger, interaction.data.options ?? []),
              };
            case 'setup':
              assert(typeof interaction.data.resolved?.channels !== 'undefined');
              assert(typeof interaction.guild_id !== 'undefined');
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, MANAGE_CHANNELS));
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  flags: MessageFlags.Ephemeral,
                  content: await handleSetup(
                    logger,
                    interaction.data.resolved.channels,
                    interaction.guild_id,
                    interaction.channel_id,
                    interaction.data.options ?? [],
                  ),
                },
              };
            case 'lockdown':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, MANAGE_CHANNELS));
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  flags: MessageFlags.Ephemeral,
                  content: await handleLockdown(logger, timestamp, interaction.channel_id),
                },
              };
            case 'resend':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.user?.id !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, MANAGE_MESSAGES));
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                  flags: MessageFlags.Ephemeral,
                  content: await handleResend(
                    logger,
                    timestamp,
                    interaction.member.permissions,
                    interaction.channel_id,
                    interaction.member.user.id,
                    interaction.data.options ?? [],
                  ),
                },
              };
            case 'info':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleInfo(logger, interaction.data.options ?? []),
              };
            default:
              fail(`unexpected application command chat input name ${interaction.data.name}`);
              break;
          }
          break;
        case InteractionApplicationCommandType.Message:
          switch (interaction.data.name) {
            case 'Reply Anonymously':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, SEND_MESSAGES));
              return await handleReplyModal(
                logger,
                timestamp,
                interaction.channel_id,
                interaction.data.target_id,
              );
            default:
              fail(
                `unexpected interaction application command message name ${interaction.data.name}`,
              );
              break;
          }
          break;
        default:
          fail(`unexpected interaction application command type ${interaction.data.type}`);
          break;
      }
      break;
    case InteractionType.MessageComponent:
      assert(typeof interaction.message !== 'undefined');
      assert(typeof interaction.member?.user !== 'undefined');
      assert(typeof interaction.member.permissions !== 'undefined');
      strictEqual(interaction.data.component_type, MessageComponentType.Button);
      return await handleApproval(
        logger,
        timestamp,
        interaction.data.custom_id,
        interaction.member.user.id,
        interaction.member.permissions,
      );
    case InteractionType.ModalSubmit:
      switch (interaction.data.custom_id) {
        case 'reply':
          assert(typeof interaction.channel_id !== 'undefined');
          assert(typeof interaction.member?.user !== 'undefined');
          assert(typeof interaction.member.permissions !== 'undefined');
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: await handleReplySubmit(
                logger,
                timestamp,
                interaction.channel_id,
                interaction.member.user.id,
                interaction.member.permissions,
                interaction.data.components,
              ),
            },
          };
        case 'confess':
          assert(typeof interaction.channel_id !== 'undefined');
          assert(typeof interaction.member?.user !== 'undefined');
          assert(typeof interaction.member.permissions !== 'undefined');
          return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              flags: MessageFlags.Ephemeral,
              content: await handleConfessSubmit(
                logger,
                timestamp,
                interaction.channel_id,
                interaction.member.user.id,
                interaction.member.permissions,
                interaction.data.components,
              ),
            },
          };
        default:
          fail(`unexpected modal submit ${interaction.data.custom_id}`);
          break;
      }
      break;
  }
}

export async function POST({ locals: { logger }, request }) {
  const ed25519 = request.headers.get('X-Signature-Ed25519');
  if (ed25519 === null) error(400);

  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (timestamp === null) error(400);

  // Used for validating the update time in interactions
  const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

  const contentType = request.headers.get('Content-Type');
  if (contentType === null || contentType !== 'application/json') error(400);

  const text = await request.text();
  const message = Buffer.from(timestamp + text);
  const signature = Buffer.from(ed25519, 'hex');

  if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
    assert(typeof logger !== 'undefined');
    const interaction = parse(DeserializedInteraction, JSON.parse(text));
    logger.info({ interaction }, 'interaction received');

    const start = performance.now();
    const response = await handleInteraction(logger, datetime, interaction);
    const interactionTimeMillis = performance.now() - start;
    logger.info({ interactionTimeMillis }, 'interaction processed');

    return json(response);
  }

  error(401);
}
