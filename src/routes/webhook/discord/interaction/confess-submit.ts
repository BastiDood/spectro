import assert, { strictEqual } from 'node:assert/strict';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { db, type InsertableAttachment } from '$lib/server/database';

// Import from shared library
import { submitConfession, ConfessError } from './confession.util';

const SERVICE_NAME = 'webhook.interaction.confess-submit';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export async function handleConfessSubmit(
  timestamp: Date,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [row, ...otherRows]: MessageComponents,
) {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'author.id': authorId.toString(),
    });

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
      // There's _technically_ a race condition here where it's possible for an attachment to be
      // deleted between the time the user triggered the modal (and hence inserting the attachment
      // to the database) and the actual getter query below.
      //
      // Consider the case of database cleanups. If a cleanup job happens to unfortunately
      // run between modal trigger and modal submission, then the query below will silently fail.
      //
      // In practice, since we don't do database cleanups nor attachment deletions, this is not a
      // concern for now. But, we should nevertheless be aware of this moving forward.
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

    if (attachmentId !== null) span.setAttribute('attachment.id', attachmentId.toString());

    try {
      return await submitConfession(
        timestamp,
        permissions,
        channelId,
        authorId,
        component.value,
        attachment,
        false,
      );
    } catch (err) {
      if (err instanceof ConfessError) {
        logger.error(err.message, err);
        return err.message;
      }
      throw err;
    }
  });
}
