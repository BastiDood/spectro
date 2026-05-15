import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { APP_ICON_URL, Color } from '$lib/server/constants';
import type { CreateMessage } from '$lib/server/models/discord/message';
import { DiscordErrorCode } from '$lib/server/models/discord/errors';
import {
  type Embed,
  type EmbedField,
  type EmbedImage,
  EmbedType,
} from '$lib/server/models/discord/embed';
import type { InteractionResponseModal } from '$lib/server/models/discord/interaction-response/modal';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { UnreachableCodeError } from '$lib/assert';

interface CreateConfessionModalOptions {
  channelId: Snowflake;
  threadId: Snowflake | null;
  parentMessageId: Snowflake | null;
}

export function createConfessionModal({
  channelId,
  threadId,
  parentMessageId,
}: CreateConfessionModalOptions): InteractionResponseModal {
  /* eslint-disable @typescript-eslint/init-declarations */
  let title: string;
  let label: string;
  let description: string;
  let placeholder: string;
  /* eslint-enable @typescript-eslint/init-declarations */

  if (parentMessageId === null) {
    title = 'Submit Confession';
    label = 'Confession';
    description = 'Your confession will be posted anonymously to the channel.';
    placeholder = 'What would you like to confess?';
  } else {
    title = 'Reply to a Message';
    label = 'Reply';
    description = 'Your reply will be posted anonymously in response to the selected message.';
    placeholder = 'What would you like to say?';
  }

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ['confess', 'message', channelId, threadId ?? '', parentMessageId ?? ''].join(':'),
      title,
      components: [
        {
          type: MessageComponentType.Label,
          label,
          description,
          component: {
            custom_id: 'content',
            type: MessageComponentType.TextInput,
            style: MessageComponentTextInputStyle.Long,
            required: true,
            placeholder,
          },
        },
        {
          type: MessageComponentType.Label,
          label: 'Attachment',
          description: 'Optional. Attach an image or file to your confession.',
          component: {
            custom_id: 'attachment',
            type: MessageComponentType.FileUpload,
            required: false,
          },
        },
        {
          type: MessageComponentType.TextDisplay,
          content:
            '-# For moderation purposes, server administrators can view the authors of all confessions.',
        },
      ],
    },
  };
}

export function createThreadConfessionModal(channelId: Snowflake): InteractionResponseModal {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ['confess', 'new-thread', channelId].join(':'),
      title: 'Create Anonymous Thread',
      components: [
        {
          type: MessageComponentType.Label,
          label: 'Thread Title',
          description: 'This will be used as the Discord thread name.',
          component: {
            custom_id: 'title',
            type: MessageComponentType.TextInput,
            style: MessageComponentTextInputStyle.Short,
            required: true,
            placeholder: 'What should this thread be called?',
          },
        },
        {
          type: MessageComponentType.Label,
          label: 'Confession',
          description: 'Your confession will start the anonymous thread.',
          component: {
            custom_id: 'content',
            type: MessageComponentType.TextInput,
            style: MessageComponentTextInputStyle.Long,
            required: true,
            placeholder: 'What would you like to confess?',
          },
        },
        {
          type: MessageComponentType.Label,
          label: 'Attachment',
          description: 'Optional. Attach an image or file to your confession.',
          component: {
            custom_id: 'attachment',
            type: MessageComponentType.FileUpload,
            required: false,
          },
        },
        {
          type: MessageComponentType.TextDisplay,
          content:
            '-# For moderation purposes, server administrators can view the authors of all confessions.',
        },
      ],
    },
  };
}

export function createThreadReplyConfessionModal(
  channelId: Snowflake,
  parentMessageId: Snowflake,
): InteractionResponseModal {
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ['confess', 'new-thread-reply', channelId, '', parentMessageId].join(':'),
      title: 'Create Anonymous Reply Thread',
      components: [
        {
          type: MessageComponentType.Label,
          label: 'Thread Title',
          description: 'This will be used as the Discord thread name.',
          component: {
            custom_id: 'title',
            type: MessageComponentType.TextInput,
            style: MessageComponentTextInputStyle.Short,
            required: true,
            placeholder: 'What should this thread be called?',
          },
        },
        {
          type: MessageComponentType.Label,
          label: 'Reply',
          description: 'Your reply will start an anonymous thread from the selected message.',
          component: {
            custom_id: 'content',
            type: MessageComponentType.TextInput,
            style: MessageComponentTextInputStyle.Long,
            required: true,
            placeholder: 'What would you like to say?',
          },
        },
        {
          type: MessageComponentType.Label,
          label: 'Attachment',
          description: 'Optional. Attach an image or file to your reply.',
          component: {
            custom_id: 'attachment',
            type: MessageComponentType.FileUpload,
            required: false,
          },
        },
        {
          type: MessageComponentType.TextDisplay,
          content:
            '-# For moderation purposes, server administrators can view the authors of all confessions.',
        },
      ],
    },
  };
}

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

export interface SerializedAttachment {
  id: string;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height?: number | null;
  width?: number | null;
}

type DeserializableAttachment = Pick<
  SerializedAttachment,
  'contentType' | 'filename' | 'height' | 'id' | 'url' | 'width'
>;

interface ConfessionPayloadInput {
  confessionId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
  channel: {
    label: string;
    color: string | null;
  };
  attachment: DeserializableAttachment | null;
}

interface LogPayloadInput extends ConfessionPayloadInput {
  channelId: string;
  publishChannelId: string;
  authorId: string;
  channel: ConfessionPayloadInput['channel'] & {
    guildId: string;
  };
  thread: {
    id: string;
    title: string;
  } | null;
}

function deserializeAttachment(attachment: DeserializableAttachment | null) {
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
  confession: ConfessionPayloadInput,
  timestampOverride?: Date,
) {
  const attachment = deserializeAttachment(confession.attachment);

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let hex: number | undefined;
  if (confession.channel.color !== null) hex = Number.parseInt(confession.channel.color, 2);

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
    if (attachment.content_type?.includes('image') === true) {
      embed.image = { url: attachment.url };
      if (typeof attachment.height === 'number') embed.image.height = attachment.height;
      if (typeof attachment.width === 'number') embed.image.width = attachment.width;
    } else {
      embed.fields = [{ name: 'Attachment', value: attachment.url, inline: true }];
    }

  const params: CreateMessage = {
    allowed_mentions: { parse: [AllowedMentionType.Users] },
    embeds: [embed],
  };

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
  confession: LogPayloadInput,
  mode: LogPayloadMode,
  durableAttachmentUrl?: string,
) {
  const ephemeralAttachment = deserializeAttachment(confession.attachment);

  const fields: EmbedField[] = [
    { name: 'Authored by', value: `||<@${confession.authorId}>||`, inline: true },
  ];

  if (mode.type === LogPayloadType.Resent)
    fields.push({ name: 'Resent by', value: `<@${mode.moderatorId}>`, inline: true });

  fields.push({ name: 'Destination', value: `<#${confession.publishChannelId}>`, inline: true });

  if (confession.thread !== null) {
    fields.push({ name: 'Parent Channel', value: `<#${confession.channelId}>`, inline: true });
    fields.push({ name: 'Thread Title', value: confession.thread.title, inline: true });
  }

  if (confession.parentMessageId !== null)
    fields.push({
      name: 'Reply To',
      value: `https://discord.com/channels/${confession.channel.guildId}/${confession.publishChannelId}/${confession.parentMessageId}`,
      inline: true,
    });

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let image: EmbedImage | undefined;
  if (
    ephemeralAttachment !== null &&
    typeof durableAttachmentUrl !== 'undefined' &&
    ephemeralAttachment.content_type?.startsWith('image/')
  ) {
    image = { url: durableAttachmentUrl };
    if (typeof ephemeralAttachment.height === 'number') image.height = ephemeralAttachment.height;
    if (typeof ephemeralAttachment.width === 'number') image.width = ephemeralAttachment.width;
  }

  // Regular non-image attachments will be attached literally above the embed.
  // There is no need to duplicate the attachment reference here.

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
      UnreachableCodeError.throwNew();
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
      UnreachableCodeError.throwNew();
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
            emoji: { name: '✒️' },
            custom_id: `publish:${customId}`,
          },
          {
            type: MessageComponentType.Button,
            style: MessageComponentButtonStyle.Danger,
            label: 'Delete',
            emoji: { name: '🗑️' },
            custom_id: `delete:${customId}`,
          },
        ],
      },
    ];
  }

  return params;
}

export function getConfessionErrorMessage(
  code: DiscordErrorCode,
  { label, confessionId, channel, status }: ErrorMessageContext,
) {
  switch (code) {
    case DiscordErrorCode.UnknownChannel:
      return `${label} #${confessionId} has been ${status}, but the ${channel} no longer exists.`;
    case DiscordErrorCode.MissingAccess:
      return `${label} #${confessionId} has been ${status}, but Spectro cannot access the ${channel}.`;
    case DiscordErrorCode.MissingPermissions:
      return `${label} #${confessionId} has been ${status}, but Spectro doesn't have permission to send messages in the ${channel}.`;
    default:
      return `${label} #${confessionId} has been ${status}, but an unexpected error occurred. Please report this bug to the Spectro developers.`;
  }
}

export function getThreadCreationErrorMessage(
  code: DiscordErrorCode,
  { label, confessionId }: Pick<ErrorMessageContext, 'label' | 'confessionId'>,
) {
  switch (code) {
    case DiscordErrorCode.UnknownChannel:
      return `${label} #${confessionId} has been submitted, but the channel for the Discord thread no longer exists.`;
    case DiscordErrorCode.MissingAccess:
      return `${label} #${confessionId} has been submitted, but Spectro cannot access the channel to create a thread.`;
    case DiscordErrorCode.MissingPermissions:
      return `${label} #${confessionId} has been submitted, but Spectro does not have permission to create the thread.`;
    case DiscordErrorCode.ThreadAlreadyCreatedForMessage:
      return `${label} #${confessionId} has been submitted, but Discord already has a thread for the selected message.`;
    case DiscordErrorCode.ThreadLocked:
      return `${label} #${confessionId} has been submitted, but Discord rejected the thread because it is locked.`;
    case DiscordErrorCode.MaxActiveThreadsReached:
      return `${label} #${confessionId} has been submitted, but Discord has reached the maximum number of active threads for this server.`;
    default:
      return `${label} #${confessionId} has been submitted, but Spectro could not create the Discord thread. Please report this bug to the Spectro developers.`;
  }
}
