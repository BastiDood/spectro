import assert, { strictEqual } from 'node:assert/strict';
import type { Logger } from 'pino';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { db, type InsertableAttachment } from '$lib/server/database';

// Import from shared library
import { submitConfession, ConfessError } from './confession.util';

export async function handleConfessSubmit(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [row, ...otherRows]: MessageComponents,
) {
  strictEqual(otherRows.length, 0);
  assert(typeof row !== 'undefined');

  const [component, ...otherComponents] = row.components;
  strictEqual(otherComponents.length, 0);
  assert(typeof component !== 'undefined');

  strictEqual(component?.type, MessageComponentType.TextInput);
  assert(typeof component.value !== 'undefined');
  assert(typeof component.custom_id !== 'undefined');

  // Parse attachment ID from custom_id
  const [prefix, attachmentIdString, ...rest] = component.custom_id.split('|');
  assert(prefix === 'content', 'invalid custom_id prefix');
  assert(typeof attachmentIdString !== 'undefined', 'attachment ID is required');
  assert(rest.length === 0, 'invalid custom_id format');

  const attachmentId = attachmentIdString === '' ? null : BigInt(attachmentIdString);

  // Fetch attachment from database if ID exists
  let attachment: InsertableAttachment | null = null;
  if (attachmentId !== null) {
    const attachmentRecord = await db.query.attachment.findFirst({
      columns: { id: false },
      where({ id }, { eq }) {
        return eq(id, attachmentId);
      },
    });

    if (typeof attachmentRecord !== 'undefined')
      attachment = {
        id: attachmentId,
        filename: attachmentRecord.filename,
        url: attachmentRecord.url,
        proxy_url: attachmentRecord.url,
        content_type: attachmentRecord.contentType ?? void 0,
      };
  }

  try {
    return await submitConfession(
      logger,
      timestamp,
      permissions,
      channelId,
      authorId,
      component.value,
      attachment,
    );
  } catch (err) {
    if (err instanceof ConfessError) {
      logger.error(err, err.message);
      return err.message;
    }
    throw err;
  }
}
