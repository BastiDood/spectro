import {
  ATTR_HTTP_RESPONSE_HEADER,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';
import { NonRetriableError } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.process-confession-submission.download';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);
const httpResponseHeader = ATTR_HTTP_RESPONSE_HEADER;

export class BadDownloadResponseError extends Error {
  constructor() {
    super('Failed to download the attachment.');
    this.name = 'BadDownloadResponseError';
  }

  static throwNew(): never {
    const error = new BadDownloadResponseError();
    logger.error(
      error.message,
      'spectro.inngest.confession_submission.attachment_download_failed',
      void 0,
      error,
    );
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
    logger.error(
      error.message,
      'spectro.inngest.confession_submission.attachment_body_missing',
      void 0,
      error,
    );
    throw error;
  }
}

export class MissingContentLengthHeaderError extends NonRetriableError {
  constructor(public readonly contentLength?: string) {
    super(
      typeof contentLength === 'undefined'
        ? 'The `Content-Length` header is missing.'
        : `The Content-Length header is malformed: ${contentLength}`,
    );
    this.name = 'MissingContentLengthHeaderError';
  }

  static throwNew(contentLength?: string): never {
    const boundedContentLength = contentLength?.slice(0, 128);
    const error = new MissingContentLengthHeaderError(boundedContentLength);
    if (typeof boundedContentLength === 'undefined')
      logger.error(
        error.message,
        'spectro.inngest.confession_submission.attachment_content_length_missing',
        void 0,
        error,
      );
    else
      logger.error(
        error.message,
        'spectro.inngest.confession_submission.attachment_content_length_malformed',
        { 'spectro.attachment.content_length': boundedContentLength },
        error,
      );
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
    logger.error(
      error.message,
      'spectro.inngest.confession_submission.attachment_too_large',
      {
        'spectro.attachment.maximum_size_bytes': maxBytes,
        'spectro.attachment.content_length_bytes': contentLength,
      },
      error,
    );
    throw error;
  }
}

function createUploadLimitTransformStream(maxBytes: number) {
  let receivedBytes = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      receivedBytes += chunk.byteLength;
      if (maxBytes < receivedBytes) AttachmentTooLargeError.throwNew(receivedBytes, maxBytes);
      controller.enqueue(chunk);
    },
  });
}

const NUMBER_REGEXP = /^(?:0|[1-9]\d*)$/u;
export function downloadDiscordAttachment(response: Response, maxBytes: number) {
  return tracer.asyncSpan('download-attachment', async span => {
    span.setAttributes({
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: response.status,
      'spectro.attachment.maximum_size_bytes': maxBytes,
    });

    if (!response.ok) BadDownloadResponseError.throwNew();
    if (response.body === null) MissingBodyError.throwNew();

    const rawContentLength = response.headers.get('Content-Length');
    if (rawContentLength === null) MissingContentLengthHeaderError.throwNew();
    span.setAttribute(httpResponseHeader('content-length'), [rawContentLength]);

    const trimmedContentLength = rawContentLength.trim();
    if (!NUMBER_REGEXP.test(trimmedContentLength))
      MissingContentLengthHeaderError.throwNew(trimmedContentLength);

    const contentLength = Number.parseFloat(trimmedContentLength);
    if (!Number.isSafeInteger(contentLength))
      MissingContentLengthHeaderError.throwNew(rawContentLength);
    if (maxBytes < contentLength) AttachmentTooLargeError.throwNew(contentLength, maxBytes);

    const body = response.body.pipeThrough(createUploadLimitTransformStream(maxBytes));
    const attachment = await new Response(body).arrayBuffer();
    span.setAttribute('spectro.attachment.content_length_bytes', attachment.byteLength);
    return attachment;
  });
}
