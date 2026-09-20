import assert, { strictEqual } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { type Channel, ChannelType } from '$lib/server/models/discord/channel';
import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';
import { handleApproval } from '$lib/server/interactions/approval';
import { handleConfess } from '$lib/server/interactions/confess';
import { handleHelp } from '$lib/server/interactions/help';
import { handleInfo } from '$lib/server/interactions/info';
import { handleLockdown } from '$lib/server/interactions/lockdown';
import { handleModalSubmit } from '$lib/server/interactions/confess/submit';
import { handleReplyModal } from '$lib/server/interactions/reply';
import { handleResend } from '$lib/server/interactions/resend';
import { handleSetup } from '$lib/server/interactions/setup';
import { handleThread } from '$lib/server/interactions/thread';
import { handleThreadReplyModal } from '$lib/server/interactions/thread-reply';
import { hasAllFlags } from '$lib/bits';
import { Interaction } from '$lib/server/models/discord/interaction';
import { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { InteractionType } from '$lib/server/models/discord/interaction/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MANAGE_CHANNELS, MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import {
  resolveConfessionChannelId,
  resolveConfessionDestination,
} from '$lib/server/interactions/confession-context';
import { Tracer } from '$lib/server/telemetry/tracer';
import {
  UnexpectedApplicationCommandChatInputNameError,
  UnexpectedApplicationCommandMessageNameError,
  UnexpectedApplicationCommandTypeError,
} from '$lib/server/interactions/errors';
import { UnreachableCodeError } from '$lib/server/assert';

const SERVICE_NAME = 'webhook.interaction';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

function getModalChannelContext(
  channel: Pick<Channel, 'id' | 'name' | 'thread_metadata' | 'type'>,
) {
  switch (channel.type) {
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      assert(typeof channel.thread_metadata !== 'undefined');
      assert(typeof channel.name === 'string');
      return {
        channelId: channel.id,
        isLockedThread: channel.thread_metadata.locked,
        threadTitle: channel.name,
      };
    default:
      return {
        channelId: channel.id,
        isLockedThread: null,
        threadTitle: null,
      };
  }
}

async function handleInteraction(
  timestamp: Date,
  interaction: Interaction,
): Promise<InteractionResponse> {
  switch (interaction.type) {
    case InteractionType.Ping:
      return { type: InteractionResponseType.Pong };
    case InteractionType.ApplicationCommand:
      switch (interaction.data.type) {
        case InteractionApplicationCommandType.ChatInput:
          switch (interaction.data.name) {
            case 'confess':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.user !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              return handleConfess(
                resolveConfessionDestination(interaction.channel),
                interaction.member.user.id,
                interaction.member.permissions,
              );
            case 'thread':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.user !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              return handleThread(
                resolveConfessionDestination(interaction.channel),
                interaction.member.user.id,
                interaction.member.permissions,
              );
            case 'help':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleHelp(interaction.data.options ?? []),
              };
            case 'setup':
              assert(typeof interaction.data.resolved?.channels !== 'undefined');
              assert(typeof interaction.guild_id !== 'undefined');
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.user?.id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllFlags(interaction.member.permissions, MANAGE_CHANNELS));
              return await handleSetup(
                timestamp,
                interaction.application_id,
                interaction.token,
                interaction.id,
                interaction.data.resolved.channels,
                interaction.guild_id,
                interaction.channel.id,
                resolveConfessionChannelId(interaction.channel),
                interaction.member.user.id,
                interaction.data.options ?? [],
              );
            case 'lockdown':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.user?.id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllFlags(interaction.member.permissions, MANAGE_CHANNELS));
              return await handleLockdown(
                timestamp,
                interaction.application_id,
                interaction.token,
                interaction.id,
                resolveConfessionChannelId(interaction.channel),
                interaction.member.user.id,
              );
            case 'resend':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.user?.id !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              assert(hasAllFlags(interaction.member.permissions, MANAGE_MESSAGES));
              return await handleResend(
                timestamp,
                interaction.application_id,
                interaction.token,
                interaction.id,
                interaction.member.permissions,
                resolveConfessionChannelId(interaction.channel),
                interaction.member.user.id,
                interaction.data.options ?? [],
              );
            case 'info':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleInfo(interaction.data.options ?? []),
              };
            default:
              break;
          }
          return UnexpectedApplicationCommandChatInputNameError.throwNew(interaction.data.name);
        case InteractionApplicationCommandType.Message:
          switch (interaction.data.name) {
            case 'Reply Anonymously':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(typeof interaction.data.resolved?.messages !== 'undefined');
              {
                const message = interaction.data.resolved.messages[interaction.data.target_id];
                assert(typeof message !== 'undefined');
                return handleReplyModal(
                  resolveConfessionDestination(interaction.channel),
                  interaction.channel.id,
                  message.id,
                  message.channel_id,
                  interaction.member.permissions,
                );
              }
            case 'Reply as Anonymous Thread':
              assert(typeof interaction.channel !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(typeof interaction.data.resolved?.messages !== 'undefined');
              {
                const message = interaction.data.resolved.messages[interaction.data.target_id];
                assert(typeof message !== 'undefined');
                return handleThreadReplyModal(
                  resolveConfessionDestination(interaction.channel),
                  interaction.channel.id,
                  message.id,
                  message.channel_id,
                  interaction.member.permissions,
                );
              }
            default:
              break;
          }
          return UnexpectedApplicationCommandMessageNameError.throwNew(interaction.data.name);
        default:
          break;
      }
      return UnexpectedApplicationCommandTypeError.throwNew(interaction.data.type);
    case InteractionType.MessageComponent:
      assert(typeof interaction.message !== 'undefined');
      assert(typeof interaction.member?.user !== 'undefined');
      assert(typeof interaction.member.permissions !== 'undefined');
      strictEqual(interaction.data.component_type, MessageComponentType.Button);
      return await handleApproval(
        timestamp,
        interaction.application_id,
        interaction.token,
        interaction.id,
        interaction.data.custom_id,
        interaction.member.user.id,
        interaction.member.permissions,
      );
    case InteractionType.ModalSubmit:
      assert(typeof interaction.member?.user !== 'undefined');
      assert(typeof interaction.member.permissions !== 'undefined');
      assert(typeof interaction.channel !== 'undefined');
      return await handleModalSubmit(
        timestamp,
        interaction.application_id,
        interaction.token,
        interaction.id,
        interaction.data.custom_id,
        getModalChannelContext(interaction.channel),
        interaction.member.user.id,
        interaction.member.permissions,
        interaction.data.components,
        interaction.data.resolved?.attachments,
      );
    default:
      break;
  }
  return UnreachableCodeError.throwNew();
}

export async function POST({ request }) {
  const ed25519 = request.headers.get('X-Signature-Ed25519');
  if (ed25519 === null) {
    logger.error(
      'Missing Ed25519 signature header',
      'spectro.discord.interaction.signature_header_missing',
    );
    error(400);
  }

  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (timestamp === null) {
    logger.error(
      'Missing timestamp header',
      'spectro.discord.interaction.timestamp_header_missing',
    );
    error(400);
  }

  const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

  const contentType = request.headers.get('Content-Type');
  if (contentType === null || contentType !== 'application/json') {
    logger.error('Invalid content type header', 'spectro.discord.interaction.content_type_invalid');
    error(400);
  }

  const text = await request.text();
  const message = Buffer.from(timestamp + text);
  const signature = Buffer.from(ed25519, 'hex');

  if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
    const interaction = parse(Interaction, JSON.parse(text));
    const response = await tracer.asyncSpan('handle-interaction', async span => {
      span.setAttributes({
        'spectro.discord.interaction.type': interaction.type,
        'spectro.discord.interaction.id': interaction.id.toString(),
        'spectro.discord.application.id': interaction.application_id.toString(),
      });
      const handled = await handleInteraction(datetime, interaction);
      span.setAttribute('spectro.discord.interaction.response.type', handled.type);
      return handled;
    });

    return json(response);
  }

  logger.error('Invalid signature', 'spectro.discord.interaction.invalid_signature');
  error(401);
}
