import { NonRetriableError } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.process-confession-submission.download';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export class BadDownloadResponseError extends Error {
  constructor() {
    super('Failed to download the attachment.');
    this.name = 'BadDownloadResponseError';
  }

  static throwNew(): never {
    const error = new BadDownloadResponseError();
    logger.error('failed to download attachment', error);
    throw error;
  }
}

export class MissingBodyError extends NonRetriableError {
  constructor() {
    super('The response body is missing.');
    this.name = 'MissingBodyError';
  }

  static throwNew(): never {
    const error = new MissingBodyError();
    logger.error('missing response body', error);
    throw error;
  }
}

export class MissingContentLengthHeaderError extends NonRetriableError {
  constructor(public readonly contentLength?: string) {
    super('The `Content-Length` header is missing.');
    this.name = 'MissingContentLengthHeaderError';
  }

  static throwNew(contentLength?: string): never {
    const error = new MissingContentLengthHeaderError(contentLength);
    logger.error('failed to download attachment', error);
    throw error;
  }
}

export class AttachmentTooLargeError extends NonRetriableError {
  constructor(
    public readonly contentLength: number,
    public readonly maxBytes: number,
  ) {
    super(`Attachment too large: ${contentLength} > ${maxBytes} bytes.`);
    this.name = 'AttachmentTooLargeError';
  }

  static throwNew(contentLength: number, maxBytes: number): never {
    const error = new AttachmentTooLargeError(contentLength, maxBytes);
    logger.error('attachment too large', error, {
      'attachment.max_bytes': maxBytes,
      'http.response.header.content_length': contentLength,
    });
    throw error;
  }
}

function createUploadLimitTransformStream(maxBytes: number) {
  let receivedBytes = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      receivedBytes += chunk.byteLength;
      if (maxBytes < receivedBytes)
        controller.error(new AttachmentTooLargeError(receivedBytes, maxBytes));
      else controller.enqueue(chunk);
    },
  });
}

const NUMBER_REGEXP = /^(?:0|[1-9]\d*)$/u;
export function downloadDiscordAttachment(response: Response, maxBytes: number) {
  return tracer.asyncSpan('download-attachment', async span => {
    span.setAttribute('response.status', response.status);

    if (!response.ok) BadDownloadResponseError.throwNew();
    if (response.body === null) MissingBodyError.throwNew();

    const rawContentLength = response.headers.get('Content-Length');
    if (rawContentLength === null) MissingContentLengthHeaderError.throwNew();

    const trimmedContentLength = rawContentLength.trim();
    if (!NUMBER_REGEXP.test(trimmedContentLength))
      MissingContentLengthHeaderError.throwNew(trimmedContentLength);

    const contentLength = Number.parseFloat(trimmedContentLength);
    if (!Number.isSafeInteger(contentLength))
      MissingContentLengthHeaderError.throwNew(rawContentLength);
    if (maxBytes < contentLength) AttachmentTooLargeError.throwNew(contentLength, maxBytes);

    const body = response.body.pipeThrough(createUploadLimitTransformStream(maxBytes));
    return await new Response(body).arrayBuffer();
  });
}
