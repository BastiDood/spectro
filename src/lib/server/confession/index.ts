import { fail } from 'node:assert/strict';

import { Color } from '$lib/server/constants';
import type {
  ContainerChildComponent,
  MessageComponent,
} from '$lib/server/models/discord/message/component';
import type { CreateMessage } from '$lib/server/models/discord/message';
import { DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { InteractionResponseModal } from '$lib/server/models/discord/interaction-response/modal';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type {
  SerializedAttachment,
  SerializedConfessionForDispatch,
  SerializedConfessionForLog,
  SerializedConfessionForResend,
} from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

export function createConfessionModal(parentMessageId: Snowflake | null): InteractionResponseModal {
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let title: string;
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let label: string;
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let description: string;
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let customId: string;
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let placeholder: string;

  if (parentMessageId === null) {
    title = 'Submit Confession';
    label = 'Confession';
    description = 'Your confession will be posted anonymously to the channel.';
    customId = 'content';
    placeholder = 'What would you like to confess?';
  } else {
    title = 'Reply to a Message';
    label = 'Reply';
    description = 'Your reply will be posted anonymously in response to the selected message.';
    customId = parentMessageId;
    placeholder = 'What would you like to say?';
  }

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: 'confess',
      title,
      components: [
        {
          type: MessageComponentType.Label,
          label,
          description,
          component: {
            custom_id: customId,
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
  const accentColor = confession.channel.color
    ? Number.parseInt(confession.channel.color, 2)
    : void 0;
  const attachment = deserializeAttachment(confession.attachment);
  const timestamp = timestampOverride ?? new Date(confession.createdAt);
  const unixTimestamp = Math.floor(timestamp.valueOf() / 1000);

  // Build container children
  const containerChildren: ContainerChildComponent[] = [
    {
      type: MessageComponentType.TextDisplay,
      content: `# ${confession.channel.label} #${confession.confessionId}`,
    },
    {
      type: MessageComponentType.TextDisplay,
      content: confession.content,
    },
  ];

  // Add image as MediaGallery or attachment link as TextDisplay
  if (attachment !== null)
    if (attachment.content_type?.includes('image') === true)
      containerChildren.push({
        type: MessageComponentType.MediaGallery,
        items: [{ media: { url: attachment.url } }],
      });
    else
      containerChildren.push({
        type: MessageComponentType.TextDisplay,
        content: `**Attachment:** ${attachment.url}`,
      });

  // Add footer with timestamp
  containerChildren.push(
    {
      type: MessageComponentType.Separator,
      divider: true,
    },
    {
      type: MessageComponentType.TextDisplay,
      content: `-# Admins can access Spectro's confession logs • <t:${unixTimestamp}:R>`,
    },
  );

  const components: MessageComponent[] = [
    {
      type: MessageComponentType.Container,
      accent_color: accentColor,
      components: containerChildren,
    },
  ];

  const params: CreateMessage = {
    flags: MessageFlags.IsComponentsV2,
    components,
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
  confession: SerializedConfessionForLog | SerializedConfessionForResend,
  mode: LogPayloadMode,
) {
  const attachment = deserializeAttachment(confession.attachment);

  // Determine accent color based on mode
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let accentColor: Color;
  switch (mode.type) {
    case LogPayloadType.Pending:
      accentColor = Color.Pending;
      break;
    case LogPayloadType.Approved:
      accentColor = Color.Success;
      break;
    case LogPayloadType.Resent:
      accentColor = Color.Replay;
      break;
    default:
      fail('unreachable');
  }

  // Determine timestamp
  const timestamp =
    mode.type === LogPayloadType.Resent ? new Date() : new Date(confession.createdAt);
  const unixTimestamp = Math.floor(timestamp.valueOf() / 1000);

  // Build container children
  const containerChildren: ContainerChildComponent[] = [
    {
      type: MessageComponentType.TextDisplay,
      content: `# ${confession.channel.label} #${confession.confessionId}`,
    },
    {
      type: MessageComponentType.TextDisplay,
      content: confession.content,
    },
  ];

  // Add image as MediaGallery (except for resent mode)
  if (
    attachment !== null &&
    mode.type !== LogPayloadType.Resent &&
    attachment.content_type?.startsWith('image/')
  )
    containerChildren.push({
      type: MessageComponentType.MediaGallery,
      items: [{ media: { url: attachment.url } }],
    });

  // Build metadata text
  let metadataText = `**Authored by:** ||<@${confession.authorId}>||`;
  if (mode.type === LogPayloadType.Resent)
    metadataText += ` \u{2022} **Resent by:** <@${mode.moderatorId}>`;

  if (attachment !== null) metadataText += `\n**Attachment:** ${attachment.url}`;

  containerChildren.push(
    {
      type: MessageComponentType.Separator,
      divider: true,
    },
    {
      type: MessageComponentType.TextDisplay,
      content: metadataText,
    },
    {
      type: MessageComponentType.TextDisplay,
      content: `-# Submitted <t:${unixTimestamp}:R>`,
    },
  );

  // Add approval buttons for pending mode
  if (mode.type === LogPayloadType.Pending) {
    const customId = mode.internalId.toString();
    containerChildren.push({
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
    });
  }

  const components: MessageComponent[] = [
    {
      type: MessageComponentType.Container,
      accent_color: accentColor,
      components: containerChildren,
    },
  ];

  return {
    flags: MessageFlags.SuppressNotifications | MessageFlags.IsComponentsV2,
    components,
  } satisfies CreateMessage;
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
