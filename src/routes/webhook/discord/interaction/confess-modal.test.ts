import { describe, expect, it } from 'vitest';

import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { ConfessionDestinationType } from './channel-context';
import { handleConfess } from './confess-modal';

const SEND_MESSAGES = 1n << 11n;
const SEND_MESSAGES_IN_THREADS = 1n << 38n;
const MANAGE_THREADS = 1n << 34n;

describe('handleConfess', () => {
  it('rejects missing channel message permission', () => {
    expect(
      handleConfess(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '4012345678900020080',
        0n,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to send confessions in this channel.',
      },
    });
  });

  it('opens a channel confession modal', () => {
    expect(
      handleConfess(
        {
          type: ConfessionDestinationType.Channel,
          channelId: '1012345678900020080',
        },
        '4012345678900020080',
        SEND_MESSAGES,
      ),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:message:1012345678900020080::',
        title: 'Submit Confession',
      },
    });
  });

  it('rejects missing thread message permission', () => {
    expect(
      handleConfess(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: false,
        },
        '4012345678900020080',
        SEND_MESSAGES,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to send confessions in this thread.',
      },
    });
  });

  it('rejects locked threads without manage thread permission', () => {
    expect(
      handleConfess(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: true,
        },
        '4012345678900020080',
        SEND_MESSAGES_IN_THREADS,
      ),
    ).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: 'You do not have permission to post anonymously in this locked thread.',
      },
    });
  });

  it('opens a thread confession modal', () => {
    expect(
      handleConfess(
        {
          type: ConfessionDestinationType.Thread,
          channelId: '1012345678900020080',
          threadId: '2012345678900020080',
          isLocked: true,
        },
        '4012345678900020080',
        SEND_MESSAGES_IN_THREADS | MANAGE_THREADS,
      ),
    ).toMatchObject({
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess:message:1012345678900020080:2012345678900020080:',
        title: 'Submit Confession',
      },
    });
  });
});
