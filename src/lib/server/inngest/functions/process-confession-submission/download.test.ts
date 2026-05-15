import { describe, expect, it } from 'vitest';

import {
  AttachmentTooLargeError,
  BadDownloadResponseError,
  downloadDiscordAttachment,
  MissingBodyError,
  MissingContentLengthHeaderError,
} from './download';

function createChunk(size: number) {
  return new Uint8Array(size);
}

function createStream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function createResponse(chunks: Uint8Array[], contentLength: string, status = 200) {
  return new Response(createStream(chunks), {
    headers: { 'Content-Length': contentLength },
    status,
  });
}

describe('downloadDiscordAttachment', () => {
  it('downloads a valid response under the max size', async () => {
    const response = createResponse([createChunk(2), createChunk(2)], '4');

    await expect(downloadDiscordAttachment(response, 5)).resolves.toHaveProperty('byteLength', 4);
  });

  it('downloads a valid response exactly equal to the max size', async () => {
    const response = createResponse([createChunk(2), createChunk(3)], '5');

    await expect(downloadDiscordAttachment(response, 5)).resolves.toHaveProperty('byteLength', 5);
  });

  it('rejects a non-OK response', async () => {
    const response = createResponse([createChunk(1)], '1', 404);

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(
      BadDownloadResponseError,
    );
  });

  it('rejects a null response body', async () => {
    const response = new Response(null, { headers: { 'Content-Length': '0' } });

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(MissingBodyError);
  });

  it('rejects a missing Content-Length header', async () => {
    const response = new Response(createStream([createChunk(1)]));

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(
      MissingContentLengthHeaderError,
    );
  });

  it('rejects a malformed Content-Length header', async () => {
    const response = createResponse([createChunk(1)], '1.5');

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(
      MissingContentLengthHeaderError,
    );
  });

  it('rejects over-limit Content-Length', async () => {
    const response = createResponse([createChunk(1)], '6');

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });

  it('rejects when the stream exceeds the max size', async () => {
    const response = createResponse([createChunk(3), createChunk(3)], '6');

    await expect(downloadDiscordAttachment(response, 5)).rejects.toBeInstanceOf(
      AttachmentTooLargeError,
    );
  });
});
