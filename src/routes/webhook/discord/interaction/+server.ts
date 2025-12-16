import assert, { strictEqual } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
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
import {
  UnexpectedApplicationCommandChatInputNameError,
  UnexpectedApplicationCommandMessageNameError,
  UnexpectedApplicationCommandTypeError,
  UnexpectedModalSubmitError,
} from './errors';
import { handleHelp } from './help';
import { handleInfo } from './info';
import { handleLockdown } from './lockdown';
import { handleReplyModal } from './reply-modal';
import { handleReplySubmit } from './reply-submit';
import { handleResend } from './resend';
import { handleSetup } from './setup';
import { hasAllPermissions } from './util';

const SERVICE_NAME = 'webhook.interaction';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

async function handleInteraction(
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
              return handleConfess(interaction.channel_id, interaction.member.user.id);
            case 'help':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleHelp(interaction.data.options ?? []),
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
                  content: await handleLockdown(timestamp, interaction.channel_id),
                },
              };
            case 'resend':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.user?.id !== 'undefined');
              assert(typeof interaction.member.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, MANAGE_MESSAGES));
              return await handleResend(
                interaction.application_id,
                interaction.token,
                interaction.member.permissions,
                interaction.channel_id,
                interaction.member.user.id,
                interaction.data.options ?? [],
              );
            case 'info':
              return {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: handleInfo(interaction.data.options ?? []),
              };
            default:
              UnexpectedApplicationCommandChatInputNameError.throwNew(interaction.data.name);
          }
          break;
        case InteractionApplicationCommandType.Message:
          switch (interaction.data.name) {
            case 'Reply Anonymously':
              assert(typeof interaction.channel_id !== 'undefined');
              assert(typeof interaction.member?.permissions !== 'undefined');
              assert(hasAllPermissions(interaction.member.permissions, SEND_MESSAGES));
              return await handleReplyModal(
                timestamp,
                interaction.channel_id,
                interaction.data.target_id,
              );
            default:
              UnexpectedApplicationCommandMessageNameError.throwNew(interaction.data.name);
          }
          break;
        default:
          UnexpectedApplicationCommandTypeError.throwNew(interaction.data.type);
      }
      break;
    case InteractionType.MessageComponent:
      assert(typeof interaction.message !== 'undefined');
      assert(typeof interaction.member?.user !== 'undefined');
      assert(typeof interaction.member.permissions !== 'undefined');
      strictEqual(interaction.data.component_type, MessageComponentType.Button);
      return await handleApproval(
        timestamp,
        interaction.application_id,
        interaction.token,
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
          return await handleReplySubmit(
            timestamp,
            interaction.application_id,
            interaction.token,
            interaction.channel_id,
            interaction.member.user.id,
            interaction.member.permissions,
            interaction.data.components,
          );
        case 'confess':
          assert(typeof interaction.channel_id !== 'undefined');
          assert(typeof interaction.member?.user !== 'undefined');
          assert(typeof interaction.member.permissions !== 'undefined');
          return await handleConfessSubmit(
            timestamp,
            interaction.application_id,
            interaction.token,
            interaction.channel_id,
            interaction.member.user.id,
            interaction.member.permissions,
            interaction.data.components,
          );
        default:
          UnexpectedModalSubmitError.throwNew(interaction.data.custom_id);
      }
      break;
  }
}

export async function POST({ request }) {
  const ed25519 = request.headers.get('X-Signature-Ed25519');
  if (ed25519 === null) {
    logger.error('missing Ed25519 signature header');
    error(400);
  }

  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (timestamp === null) {
    logger.error('missing timestamp header');
    error(400);
  }

  const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

  const contentType = request.headers.get('Content-Type');
  if (contentType === null || contentType !== 'application/json') {
    logger.error('invalid content type header');
    error(400);
  }

  const text = await request.text();
  const message = Buffer.from(timestamp + text);
  const signature = Buffer.from(ed25519, 'hex');

  if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
    const interaction = parse(DeserializedInteraction, JSON.parse(text));

    const response = await tracer.asyncSpan('handle-interaction', async span => {
      span.setAttributes({
        'interaction.type': interaction.type,
        'interaction.id': interaction.id.toString(),
        'interaction.application.id': interaction.application_id.toString(),
      });
      return await handleInteraction(datetime, interaction);
    });
    logger.debug('interaction processed');

    return json(response);
  }

  logger.error('invalid signature');
  error(401);
}
