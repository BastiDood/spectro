import { APP_ICON_URL } from '$lib/server/constants';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import type { CreateMessage } from '$lib/server/models/discord/message';
import { createMessage, LogConfessionMode, logConfessionViaHttp } from '$lib/server/api/discord';
import {
  db,
  resetLogChannel,
  type SerializedAttachment,
  type SerializedConfessionForDispatch,
  type SerializedConfessionForLog,
  type SerializedConfessionForResend,
} from '$lib/server/database';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import { type Embed, EmbedType } from '$lib/server/models/discord/embed';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';

// Result types for dispatch/log operations
interface ConfessionOperationSuccess {
  ok: true;
  messageId: string;
  channelId: string;
}

interface ConfessionOperationFailure {
  ok: false;
  code: DiscordErrorCode;
}

export type ConfessionOperationResult = ConfessionOperationSuccess | ConfessionOperationFailure;

// Helper to deserialize attachment for Discord API
function deserializeAttachment(attachment: SerializedAttachment | null) {
  return attachment === null
    ? null
    : {
        id: BigInt(attachment.id),
        filename: attachment.filename,
        content_type: attachment.contentType ?? void 0,
        url: attachment.url,
        height: attachment.height,
        width: attachment.width,
      };
}

export async function dispatchConfession(
  confession: SerializedConfessionForDispatch | SerializedConfessionForResend,
  timestampOverride?: Date,
) {
  const channelId = BigInt(confession.channelId);
  const confessionId = BigInt(confession.confessionId);
  const hex = confession.channel.color ? Number.parseInt(confession.channel.color, 2) : void 0;
  const parentMessageId = confession.parentMessageId ? BigInt(confession.parentMessageId) : null;
  const attachment = deserializeAttachment(confession.attachment);

  const embed: Embed = {
    type: EmbedType.Rich,
    title: `${confession.channel.label} #${confessionId}`,
    description: confession.content,
    timestamp: timestampOverride ?? new Date(confession.createdAt),
    color: hex,
    footer: {
      text: "Admins can access Spectro's confession logs",
      icon_url: APP_ICON_URL,
    },
  };

  if (attachment !== null)
    if (attachment.content_type?.includes('image') === true)
      embed.image = {
        url: new URL(attachment.url),
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
    else embed.fields = [{ name: 'Attachment', value: attachment.url, inline: true }];

  const params: CreateMessage = { embeds: [embed] };
  if (parentMessageId !== null)
    params.message_reference = {
      type: MessageReferenceType.Default,
      message_id: parentMessageId,
      fail_if_not_exists: false,
    };

  try {
    const result = await createMessage(channelId, params, DISCORD_BOT_TOKEN);
    return {
      ok: true as const,
      messageId: result.id.toString(),
      channelId: result.channel_id.toString(),
    };
  } catch (err) {
    if (err instanceof DiscordError)
      switch (err.code) {
        case DiscordErrorCode.UnknownChannel:
        case DiscordErrorCode.MissingAccess:
        case DiscordErrorCode.MissingPermissions:
          return { ok: false as const, code: err.code };
        default:
          break;
      }
    throw err;
  }
}

/** Reset log channel when it's been deleted */
async function handleUnknownLogChannel(channelId: string) {
  const channelIdBigInt = BigInt(channelId);
  await resetLogChannel(db, channelIdBigInt);
}

/** Log a posted confession (pending or approved) to the log channel */
export async function logPostedConfession(confession: SerializedConfessionForLog) {
  const logChannelId = BigInt(confession.channel.logChannelId!);
  const confessionId = BigInt(confession.confessionId);
  const authorId = BigInt(confession.authorId);
  const attachment = deserializeAttachment(confession.attachment);

  const options = confession.channel.isApprovalRequired
    ? { mode: LogConfessionMode.Pending as const, internalId: BigInt(confession.internalId) }
    : { mode: LogConfessionMode.Approved as const };

  try {
    const result = await logConfessionViaHttp(
      new Date(confession.createdAt),
      logChannelId,
      confessionId,
      authorId,
      confession.channel.label,
      confession.content,
      attachment,
      options,
    );
    return {
      ok: true as const,
      messageId: result.id.toString(),
      channelId: result.channel_id.toString(),
    };
  } catch (err) {
    if (err instanceof DiscordError)
      switch (err.code) {
        case DiscordErrorCode.UnknownChannel:
          await handleUnknownLogChannel(confession.channelId);
          return { ok: false as const, code: err.code };
        case DiscordErrorCode.MissingAccess:
        case DiscordErrorCode.MissingPermissions:
          return { ok: false as const, code: err.code };
        default:
          break;
      }
    throw err;
  }
}

/** Log a resent confession to the log channel */
export async function logResentConfession(
  confession: SerializedConfessionForResend,
  moderatorId: bigint,
) {
  const logChannelId = BigInt(confession.channel.logChannelId!);
  const confessionId = BigInt(confession.confessionId);
  const authorId = BigInt(confession.authorId);
  const attachment = deserializeAttachment(confession.attachment);

  try {
    const result = await logConfessionViaHttp(
      new Date(), // Use current timestamp for resent logs
      logChannelId,
      confessionId,
      authorId,
      confession.channel.label,
      confession.content,
      attachment,
      { mode: LogConfessionMode.Resent, moderatorId },
    );
    return {
      ok: true as const,
      messageId: result.id.toString(),
      channelId: result.channel_id.toString(),
    };
  } catch (err) {
    if (err instanceof DiscordError)
      switch (err.code) {
        case DiscordErrorCode.UnknownChannel:
          await handleUnknownLogChannel(confession.channelId);
          return { ok: false as const, code: err.code };
        case DiscordErrorCode.MissingAccess:
        case DiscordErrorCode.MissingPermissions:
          return { ok: false as const, code: err.code };
        default:
          break;
      }
    throw err;
  }
}
