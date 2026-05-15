import { describe, expect, it } from 'vitest';

import { DiscordErrorCode } from '$lib/server/models/discord/errors';

import { createConfessionPayload, getThreadCreationErrorMessage } from '.';

const confession = {
  confessionId: '42',
  content: 'hello world',
  createdAt: '2026-05-15T00:00:00.000Z',
  parentMessageId: null,
  channel: {
    label: 'Confession',
    color: null,
  },
};

describe('createConfessionPayload', () => {
  it('serializes image attachments as embed images', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: {
        id: '1234567891233211234',
        filename: 'image.png',
        contentType: 'image/png',
        url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
        height: 720,
        width: 1280,
      },
    });

    expect(payload.embeds?.[0]?.image).toEqual({
      url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
      height: 720,
      width: 1280,
    });
    expect(payload.embeds?.[0]?.fields).toBeUndefined();
  });

  it('serializes non-image attachments as embed fields', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: {
        id: '1234567891233211234',
        filename: 'notes.txt',
        contentType: 'text/plain',
        url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
      },
    });

    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Attachment',
        value:
          'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
        inline: true,
      },
    ]);
    expect(payload.embeds?.[0]?.image).toBeUndefined();
  });

  it('omits attachment rendering when no attachment exists', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: null,
    });

    expect(payload.embeds?.[0]?.image).toBeUndefined();
    expect(payload.embeds?.[0]?.fields).toBeUndefined();
  });
});

describe('getThreadCreationErrorMessage', () => {
  it('explains when Discord already has a thread for the selected message', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.ThreadAlreadyCreatedForMessage, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Discord already has a thread for the selected message.',
    );
  });

  it('explains when Spectro cannot create more active threads', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.MaxActiveThreadsReached, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Discord has reached the maximum number of active threads for this server.',
    );
  });

  it('explains when Spectro lacks Discord permissions to create a thread', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.MissingPermissions, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Spectro does not have permission to create the thread.',
    );
  });
});
