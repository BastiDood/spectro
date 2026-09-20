import { describe, expect, it } from 'vitest';

import { ConfessionDestinationType } from '$lib/server/interactions/confession-context';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { handleThreadReplyModal } from '.';

const SEND_MESSAGES = 1n << 11n;
const CREATE_PUBLIC_THREADS = 1n << 35n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;
const THREAD_REPLY_PERMISSIONS = SEND_MESSAGES | CREATE_PUBLIC_THREADS | SEND_MESSAGES_IN_THREADS;

describe('handleThreadReplyModal', () => {
  it('rejects recursive thread replies', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
        },
        '2012345678900020080',
        '3012345678900020080',
        '2012345678900020080',
        THREAD_REPLY_PERMISSIONS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'Use `/confess` to post anonymously inside this thread.',
      },
    });
  });

  it('rejects thread replies in voice channels', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Voice,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        THREAD_REPLY_PERMISSIONS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'Anonymous threads are not supported in voice channels.',
      },
    });
  });

  it('rejects target channel mismatches', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '4012345678900020080',
        THREAD_REPLY_PERMISSIONS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content:
          'Thread reply channel 1012345678900020080 does not match target channel 4012345678900020080.',
      },
    });
  });

  it('rejects missing channel message permission', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        CREATE_PUBLIC_THREADS | SEND_MESSAGES_IN_THREADS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content:
          'Permission failure send-messages: You do not have permission to send anonymous replies in this channel.',
      },
    });
  });

  it('rejects missing public thread creation permission', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        SEND_MESSAGES | SEND_MESSAGES_IN_THREADS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content:
          'Permission failure create-public-threads: You do not have permission to create public threads in this channel.',
      },
    });
  });

  it('rejects missing thread message permission', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        SEND_MESSAGES | CREATE_PUBLIC_THREADS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content:
          'Permission failure send-messages-in-threads: You do not have permission to send messages in threads.',
      },
    });
  });

  it('opens a thread reply modal in root channels', () => {
    expect(
      handleThreadReplyModal(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '1012345678900020080',
        '3012345678900020080',
        '1012345678900020080',
        THREAD_REPLY_PERMISSIONS,
      ),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:new-thread-reply:1012345678900020080::3012345678900020080',
        title: 'Create Anonymous Reply Thread',
      },
    });
  });
});
