import { describe, expect, it } from 'vitest';
import { parse } from 'valibot';

import { AssertionError } from '$lib/assert';
import { Message } from '$lib/server/models/discord/message';

import { type DurableAttachmentMessage, extractDurableAttachmentMetadata } from '.';

const baseMessage = {
  id: '987654321987654321',
  channel_id: '1012345678900020080',
  timestamp: '2026-05-15T00:00:00.000Z',
};

function pickDurableAttachmentMessage(message: DurableAttachmentMessage) {
  return {
    id: message.id,
    channel_id: message.channel_id,
    attachments: message.attachments,
    embeds: message.embeds,
  };
}

describe('extractDurableAttachmentMetadata', () => {
  it('extracts durable metadata from returned message attachments', () => {
    const message = pickDurableAttachmentMessage(
      parse(Message, {
        ...baseMessage,
        attachments: [
          {
            id: '1234567891233211234',
            filename: 'notes.txt',
            content_type: 'text/plain',
            size: 12,
            url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
            proxy_url:
              'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/notes.txt',
          },
        ],
      }),
    );

    expect(message).toEqual({
      id: '987654321987654321',
      channel_id: '1012345678900020080',
      attachments: [
        {
          id: '1234567891233211234',
          filename: 'notes.txt',
          content_type: 'text/plain',
          size: 12,
          url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
          proxy_url:
            'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/notes.txt',
        },
      ],
    });
    expect('embeds' in message).toBe(true);
    expect(message.embeds).toBeUndefined();

    expect(extractDurableAttachmentMetadata(message)).toEqual({
      id: '1234567891233211234',
      messageId: '987654321987654321',
      channelId: '1012345678900020080',
      filename: 'notes.txt',
      contentType: 'text/plain',
      url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
      proxyUrl:
        'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/notes.txt',
      height: null,
      width: null,
    });
  });

  it('extracts durable metadata from returned embed images', () => {
    const message = pickDurableAttachmentMessage(
      parse(Message, {
        ...baseMessage,
        attachments: [],
        embeds: [
          {
            image: {
              url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
              proxy_url:
                'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/image.png',
              content_type: 'image/png',
              height: 720,
              width: 1280,
            },
          },
        ],
      }),
    );

    expect(message).toEqual({
      id: '987654321987654321',
      channel_id: '1012345678900020080',
      attachments: [],
      embeds: [
        {
          image: {
            url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
            proxy_url:
              'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/image.png',
            content_type: 'image/png',
            height: 720,
            width: 1280,
          },
        },
      ],
    });

    expect(extractDurableAttachmentMetadata(message)).toEqual({
      id: '1234567891233211234',
      messageId: '987654321987654321',
      channelId: '1012345678900020080',
      filename: 'image.png',
      contentType: 'image/png',
      url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
      proxyUrl:
        'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/image.png',
      height: 720,
      width: 1280,
    });
  });

  it('returns null when no durable attachment shape is present', () => {
    const message = pickDurableAttachmentMessage(
      parse(Message, {
        ...baseMessage,
        attachments: [],
        embeds: [],
      }),
    );

    expect(message).toEqual({
      id: '987654321987654321',
      channel_id: '1012345678900020080',
      attachments: [],
      embeds: [],
    });

    expect(extractDurableAttachmentMetadata(message)).toBeNull();
  });

  it('rejects multiple returned attachments', () => {
    const message = pickDurableAttachmentMessage(
      parse(Message, {
        ...baseMessage,
        attachments: [
          {
            id: '1234567891233211234',
            filename: 'first.txt',
            size: 12,
            url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/first.txt',
            proxy_url:
              'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/first.txt',
          },
          {
            id: '2234567891233211234',
            filename: 'second.txt',
            size: 12,
            url: 'https://cdn.discordapp.com/attachments/1012345678900020080/2234567891233211234/second.txt',
            proxy_url:
              'https://media.discordapp.net/attachments/1012345678900020080/2234567891233211234/second.txt',
          },
        ],
      }),
    );

    expect(() => extractDurableAttachmentMetadata(message)).toThrow(AssertionError);
  });

  it('rejects embed image URLs outside the durable attachment CDN namespace', () => {
    const message = pickDurableAttachmentMessage(
      parse(Message, {
        ...baseMessage,
        attachments: [],
        embeds: [
          {
            image: {
              url: 'https://cdn.discordapp.com/ephemeral-attachments/1012345678900020080/1234567891233211234/image.png',
              proxy_url:
                'https://media.discordapp.net/ephemeral-attachments/1012345678900020080/1234567891233211234/image.png',
            },
          },
        ],
      }),
    );

    expect(() => extractDurableAttachmentMetadata(message)).toThrow();
  });
});
