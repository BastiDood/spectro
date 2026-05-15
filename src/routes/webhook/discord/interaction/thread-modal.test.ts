import { describe, expect, it } from 'vitest';

import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { handleThread } from './thread-modal';

const THREAD_PERMISSIONS = BigInt(309237645312);
const CREATE_PUBLIC_THREADS = 1n << 35n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;

describe('handleThread', () => {
  it('rejects thread creation inside threads', () => {
    expect(
      handleThread('1012345678900020080', true, '4012345678900020080', THREAD_PERMISSIONS),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'Use `/confess` to post anonymously inside this thread.',
      },
    });
  });

  it('rejects missing public thread creation permission', () => {
    expect(
      handleThread('1012345678900020080', false, '4012345678900020080', SEND_MESSAGES_IN_THREADS),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to create public threads in this channel.',
      },
    });
  });

  it('rejects missing thread message permission', () => {
    expect(
      handleThread('1012345678900020080', false, '4012345678900020080', CREATE_PUBLIC_THREADS),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to send messages in threads.',
      },
    });
  });

  it('opens a thread confession modal in root channels', () => {
    expect(
      handleThread('1012345678900020080', false, '4012345678900020080', THREAD_PERMISSIONS),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:new-thread:1012345678900020080',
        title: 'Create Anonymous Thread',
      },
    });
  });
});
