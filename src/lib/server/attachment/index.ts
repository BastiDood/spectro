import assert, { strictEqual } from 'node:assert/strict';

import { assertOptional } from '$lib/assert';
import { DiscordAttachmentCdnNamespace, parseDiscordAttachmentCdnUrl } from '$lib/url/discord';
import type { Message } from '$lib/server/models/discord/message';

export interface DurableAttachmentMetadata {
  id: string;
  messageId: string;
  channelId: string;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height: number | null;
  width: number | null;
}

export type DurableAttachmentMessage = Pick<
  Message,
  'attachments' | 'channel_id' | 'embeds' | 'id'
>;

export function extractDurableAttachmentMetadata(message: DurableAttachmentMessage) {
  const attachment = assertOptional(message.attachments ?? []);

  let durableAttachment: DurableAttachmentMetadata | null = null;
  if (typeof attachment === 'undefined') {
    const embed = assertOptional(message.embeds ?? []);
    if (typeof embed !== 'undefined') {
      assert(typeof embed.image !== 'undefined');
      assert(typeof embed.image.proxy_url !== 'undefined');

      const parsedAttachmentUrl = parseDiscordAttachmentCdnUrl(embed.image.url);
      assert(parsedAttachmentUrl !== null);
      strictEqual(parsedAttachmentUrl.namespace, DiscordAttachmentCdnNamespace.Durable);
      strictEqual(parsedAttachmentUrl.channelId, message.channel_id);

      durableAttachment = {
        id: parsedAttachmentUrl.attachmentId,
        messageId: message.id,
        channelId: message.channel_id,
        filename: parsedAttachmentUrl.filename,
        url: embed.image.url,
        proxyUrl: embed.image.proxy_url,
        contentType: embed.image.content_type ?? null,
        height: embed.image.height ?? null,
        width: embed.image.width ?? null,
      };
    }
  } else {
    durableAttachment = {
      id: attachment.id,
      messageId: message.id,
      channelId: message.channel_id,
      filename: attachment.filename,
      contentType: attachment.content_type ?? null,
      url: attachment.url,
      proxyUrl: attachment.proxy_url,
      height: attachment.height ?? null,
      width: attachment.width ?? null,
    };
  }

  return durableAttachment;
}
