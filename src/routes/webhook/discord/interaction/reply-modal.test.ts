import { describe, expect, it } from 'vitest';

import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { ConfessionDestinationType } from './channel-context';
import { handleReplyModal } from './reply-modal';

const SEND_MESSAGES = 1n << 11n;
const MANAGE_THREADS = 1n << 34n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

describe('handleReplyModal', () => {
  it('rejects target channel mismatches', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '4012345678900020080',
        SEND_MESSAGES,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'Spectro cannot determine the target channel for this anonymous reply.',
      },
    });
  });

  it('rejects missing channel message permission', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        0n,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to send anonymous replies in this channel.',
      },
    });
  });

  it('opens a channel reply modal', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        SEND_MESSAGES,
      ),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:message:1012345678900020080::3012345678900020080',
        title: 'Reply to a Message',
      },
    });
  });

  it('rejects missing thread message permission', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: false,
        },
        '2012345678900020080',
        '3012345678900020080',
        '2012345678900020080',
        SEND_MESSAGES,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to send anonymous replies in this thread.',
      },
    });
  });

  it('rejects locked threads without manage thread permission', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: true,
        },
        '2012345678900020080',
        '3012345678900020080',
        '2012345678900020080',
        SEND_MESSAGES_IN_THREADS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to reply anonymously in this locked thread.',
      },
    });
  });

  it('opens a thread reply modal', () => {
    expect(
      handleReplyModal(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: true,
        },
        '2012345678900020080',
        '3012345678900020080',
        '2012345678900020080',
        SEND_MESSAGES_IN_THREADS | MANAGE_THREADS,
      ),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:message:1012345678900020080:2012345678900020080:3012345678900020080',
        title: 'Reply to a Message',
      },
    });
  });
});
