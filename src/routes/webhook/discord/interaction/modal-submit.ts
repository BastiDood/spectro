import assert, { strictEqual } from 'node:assert/strict';

import { assertDefined, assertOptional, UnreachableCodeError } from '$lib/assert';
import {
  ATTACH_FILES,
  MANAGE_THREADS,
  SEND_MESSAGES,
  SEND_MESSAGES_IN_THREADS,
} from '$lib/server/models/discord/permission';
import type { Attachment } from '$lib/server/models/discord/attachment';
import {
  ConfessionSubmitEvent,
  ConfessionSubmitMode,
} from '$lib/server/inngest/functions/process-confession-submission/schema';
import { hasAllFlags } from '$lib/bits';
import { inngest } from '$lib/server/inngest/client';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { ModalComponents } from '$lib/server/models/discord/message/component/modal';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'webhook.interaction.confess-submit';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

interface MessageModalState {
  mode: ConfessionSubmitMode.Message;
  channelId: Snowflake;
  threadId: Snowflake | null;
  parentMessageId: Snowflake | null;
}

interface NewThreadModalState {
  mode: ConfessionSubmitMode.NewThread;
  channelId: Snowflake;
  threadId: null;
  parentMessageId: null;
}

type ModalState = MessageModalState | NewThreadModalState;

interface ModalChannelContext {
  channelId: Snowflake;
  isLockedThread: boolean | null;
  threadTitle: string | null;
}

function parseModalState(customId: string): ModalState {
  const [namespace, mode, channelId, threadId, parentMessageId, ...rest] = customId.split(':');
  strictEqual(namespace, 'confess');
  strictEqual(rest.length, 0);
  assert(typeof channelId !== 'undefined');

  switch (mode) {
    case ConfessionSubmitMode.Message:
      return {
        mode,
        channelId,
        threadId: threadId === '' || typeof threadId === 'undefined' ? null : threadId,
        parentMessageId:
          parentMessageId === '' || typeof parentMessageId === 'undefined' ? null : parentMessageId,
      };
    case ConfessionSubmitMode.NewThread:
      return {
        mode,
        channelId,
        threadId: null,
        parentMessageId: null,
      };
    default:
      throw new Error('unknown confession modal state');
  }
}

export async function handleModalSubmit(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  customId: string,
  channel: ModalChannelContext,
  authorId: Snowflake,
  permissions: bigint,
  components: ModalComponents,
  resolvedAttachments?: Record<string, Attachment> | undefined,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    const state = parseModalState(customId);
    span.setAttributes({
      'channel.id': state.channelId,
      'author.id': authorId,
      'confession.mode': state.mode,
    });

    type ModalComponent = ModalComponents[number];
    /* eslint-disable @typescript-eslint/init-declarations */
    let contentLabel: ModalComponent;
    let attachmentLabel: ModalComponent;
    let disclaimerDisplay: ModalComponent;
    /* eslint-enable @typescript-eslint/init-declarations */

    let threadTitle: string | null = null;
    switch (state.mode) {
      case ConfessionSubmitMode.Message: {
        const [content, attachment, disclaimer, ...rest] = components;
        strictEqual(rest.length, 0);
        contentLabel = assertDefined(content);
        attachmentLabel = assertDefined(attachment);
        disclaimerDisplay = assertDefined(disclaimer);
        break;
      }
      case ConfessionSubmitMode.NewThread: {
        const [title, content, attachment, disclaimer, ...rest] = components;
        strictEqual(rest.length, 0);
        const titleLabel = assertDefined(title);
        strictEqual(titleLabel.type, MessageComponentType.Label);
        const { component: titleComponent } = titleLabel;
        strictEqual(titleComponent.type, MessageComponentType.TextInput);
        strictEqual(titleComponent.custom_id, 'title');
        assert(typeof titleComponent.value !== 'undefined');
        threadTitle = titleComponent.value;
        contentLabel = assertDefined(content);
        attachmentLabel = assertDefined(attachment);
        disclaimerDisplay = assertDefined(disclaimer);
        break;
      }
      default:
        throw new Error('unknown confession modal mode');
    }

    strictEqual(disclaimerDisplay.type, MessageComponentType.TextDisplay);
    strictEqual(contentLabel.type, MessageComponentType.Label);

    const { component: contentComponent } = contentLabel;
    strictEqual(contentComponent.type, MessageComponentType.TextInput);
    strictEqual(contentComponent.custom_id, 'content');
    assert(typeof contentComponent.value !== 'undefined');
    strictEqual(attachmentLabel.type, MessageComponentType.Label);

    const { component: attachmentComponent } = attachmentLabel;
    strictEqual(attachmentComponent.type, MessageComponentType.FileUpload);
    strictEqual(attachmentComponent.custom_id, 'attachment');

    if (state.threadId === null) {
      if (!hasAllFlags(permissions, SEND_MESSAGES))
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'You do not have permission to send confessions in this channel.',
          },
        };
    } else {
      span.setAttribute('thread.id', state.threadId);
      if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'You do not have permission to send confessions in this thread.',
          },
        };
      if (channel.isLockedThread === null)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'Spectro cannot confirm whether this thread is available.',
          },
        };
      if (channel.isLockedThread && !hasAllFlags(permissions, MANAGE_THREADS))
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'You do not have permission to post anonymously in this locked thread.',
          },
        };
    }

    const attachmentId = assertOptional(attachmentComponent.values ?? []);
    let attachment = null;
    if (typeof attachmentId !== 'undefined') {
      assert(hasAllFlags(permissions, ATTACH_FILES));
      assert(typeof resolvedAttachments !== 'undefined');
      const attachmentData = resolvedAttachments[attachmentId];
      assert(typeof attachmentData !== 'undefined');
      attachment = {
        id: attachmentData.id,
        filename: attachmentData.filename,
        contentType: attachmentData.content_type ?? null,
        url: attachmentData.url,
        proxyUrl: attachmentData.proxy_url,
      };
    }

    switch (state.mode) {
      case ConfessionSubmitMode.Message:
        if (state.threadId !== null) {
          assert(channel.channelId === state.threadId);
          const { threadTitle: existingThreadTitle } = channel;
          assert(existingThreadTitle !== null);
          threadTitle = existingThreadTitle;
        }
        break;
      case ConfessionSubmitMode.NewThread:
        break;
      default:
        UnreachableCodeError.throwNew();
    }

    // eslint-disable-next-line @typescript-eslint/init-declarations
    let ids: string[];
    switch (state.mode) {
      case ConfessionSubmitMode.Message:
        ({ ids } = await inngest.send(
          ConfessionSubmitEvent.create(
            {
              applicationId,
              interactionId,
              interactionToken,
              channelId: state.channelId,
              authorId,
              content: contentComponent.value,
              attachment,
              mode: ConfessionSubmitMode.Message,
              threadId: state.threadId,
              threadTitle,
              parentMessageId: state.parentMessageId,
            },
            { id: interactionId, ts: timestamp.valueOf() },
          ),
        ));
        break;
      case ConfessionSubmitMode.NewThread:
        assert(threadTitle !== null);
        ({ ids } = await inngest.send(
          ConfessionSubmitEvent.create(
            {
              applicationId,
              interactionId,
              interactionToken,
              channelId: state.channelId,
              authorId,
              content: contentComponent.value,
              attachment,
              mode: ConfessionSubmitMode.NewThread,
              threadTitle,
            },
            { id: interactionId, ts: timestamp.valueOf() },
          ),
        ));
        break;
      default:
        UnreachableCodeError.throwNew();
    }

    logger.debug('confession submission queued', { 'inngest.events.id': ids });
    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
