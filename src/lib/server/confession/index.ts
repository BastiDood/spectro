import { fail } from 'node:assert/strict';

import { APP_ICON_URL, Color } from '$lib/server/constants';

import type { CreateMessage } from '$lib/server/models/discord/message';
import type {
  SerializedAttachment,
  SerializedConfessionForDispatch,
  SerializedConfessionForLog,
  SerializedConfessionForResend,
} from '$lib/server/database';
import { DiscordErrorCode } from '$lib/server/models/discord/errors';
import {
  type Embed,
  type EmbedField,
  type EmbedImage,
  EmbedType,
} from '$lib/server/models/discord/embed';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';

export const enum LogPayloadType {
  Pending = 'pending',
  Approved = 'approved',
  Resent = 'resent',
}

export interface PendingLogPayload {
  type: LogPayloadType.Pending;
  internalId: bigint;
}

export interface ApprovedLogPayload {
  type: LogPayloadType.Approved;
}

export interface ResentLogPayload {
  type: LogPayloadType.Resent;
  moderatorId: bigint;
}

export type LogPayloadMode = PendingLogPayload | ApprovedLogPayload | ResentLogPayload;

export const enum ConfessionChannel {
  Confession = 'confession channel',
  Log = 'log channel',
}

interface ErrorMessageContext {
  label: string;
  confessionId: string;
  channel: ConfessionChannel;
  status: string;
}

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

/** Create a confession message payload for the public confession channel */
export function createConfessionPayload(
  confession: SerializedConfessionForDispatch | SerializedConfessionForResend,
  timestampOverride?: Date,
) {
  const hex = confession.channel.color ? Number.parseInt(confession.channel.color, 2) : void 0;
  const attachment = deserializeAttachment(confession.attachment);

  const embed: Embed = {
    type: EmbedType.Rich,
    title: `${confession.channel.label} #${confession.confessionId}`,
    description: confession.content,
    timestamp: timestampOverride?.toISOString() ?? confession.createdAt,
    color: hex,
    footer: {
      text: "Admins can access Spectro's confession logs",
      icon_url: APP_ICON_URL,
    },
  };

  if (attachment !== null)
    if (attachment.content_type?.includes('image') === true)
      embed.image = {
        url: attachment.url,
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
    else embed.fields = [{ name: 'Attachment', value: attachment.url, inline: true }];

  const params: CreateMessage = { embeds: [embed] };

  if (confession.parentMessageId !== null)
    params.message_reference = {
      type: MessageReferenceType.Default,
      message_id: confession.parentMessageId,
      fail_if_not_exists: false,
    };

  return params;
}

/** Create a log message payload for the moderator log channel */
export function createLogPayload(
  confession: SerializedConfessionForLog | SerializedConfessionForResend,
  mode: LogPayloadMode,
) {
  const attachment = deserializeAttachment(confession.attachment);

  const fields: EmbedField[] = [
    { name: 'Authored by', value: `||<@${confession.authorId}>||`, inline: true },
  ];

  if (mode.type === LogPayloadType.Resent)
    fields.push({ name: 'Resent by', value: `<@${mode.moderatorId}>`, inline: true });

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let image: EmbedImage | undefined;
  if (attachment !== null) {
    fields.push({ name: 'Attachment', value: attachment.url, inline: true });
    // Resent mode does not embed images
    if (mode.type !== LogPayloadType.Resent && attachment.content_type?.startsWith('image/'))
      image = {
        url: attachment.url,
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
  }

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let color: Color;
  switch (mode.type) {
    case LogPayloadType.Pending:
      color = Color.Pending;
      break;
    case LogPayloadType.Approved:
      color = Color.Success;
      break;
    case LogPayloadType.Resent:
      color = Color.Replay;
      break;
    default:
      fail('unreachable');
  }

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let timestamp: string;
  switch (mode.type) {
    case LogPayloadType.Resent:
      timestamp = new Date().toISOString();
      break;
    case LogPayloadType.Approved:
    case LogPayloadType.Pending:
      timestamp = confession.createdAt;
      break;
    default:
      fail('unreachable');
  }

  const params: CreateMessage = {
    flags: MessageFlags.SuppressNotifications,
    allowed_mentions: { parse: [AllowedMentionType.Users] },
    embeds: [
      {
        type: EmbedType.Rich,
        title: `${confession.channel.label} #${confession.confessionId}`,
        color,
        timestamp,
        description: confession.content,
        footer: { text: 'Spectro Logs', icon_url: APP_ICON_URL },
        fields,
        image,
      },
    ],
  };

  // Add approval buttons for pending mode
  if (mode.type === LogPayloadType.Pending) {
    const customId = mode.internalId.toString();
    params.components = [
      {
        type: MessageComponentType.ActionRow,
        components: [
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Success,
            label: 'Publish',
            emoji: { name: '\u{2712}\u{fe0f}' },
            custom_id: `publish:${customId}`,
          },
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Danger,
            label: 'Delete',
            emoji: { name: '\u{1f5d1}\u{fe0f}' },
            custom_id: `delete:${customId}`,
          },
        ],
      },
    ];
  }

  return params;
}

export function getConfessionErrorMessage(code: DiscordErrorCode, ctx: ErrorMessageContext) {
  switch (code) {
    case DiscordErrorCode.UnknownChannel:
      return `${ctx.label} #${ctx.confessionId} has been ${ctx.status}, but the ${ctx.channel} no longer exists.`;
    case DiscordErrorCode.MissingAccess:
      return `${ctx.label} #${ctx.confessionId} has been ${ctx.status}, but Spectro cannot access the ${ctx.channel}.`;
    case DiscordErrorCode.MissingPermissions:
      return `${ctx.label} #${ctx.confessionId} has been ${ctx.status}, but Spectro doesn't have permission to send messages in the ${ctx.channel}.`;
    default:
      return `${ctx.label} #${ctx.confessionId} has been ${ctx.status}, but an unexpected error occurred. Please report this bug to the Spectro developers.`;
  }
}
