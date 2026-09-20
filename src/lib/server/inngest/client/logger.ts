import * as v from 'valibot';
import type { AnyValue, AnyValueMap } from '@opentelemetry/api-logs';

import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('inngest');

type InngestLogSeverity = 'debug' | 'info' | 'warn' | 'error';

const InngestAttributeValue: v.GenericSchema<unknown, AnyValue> = v.lazy(() =>
  v.union([
    v.string(),
    v.number(),
    v.boolean(),
    v.null(),
    v.undefined(),
    v.instance(Uint8Array),
    v.array(InngestAttributeValue),
    v.record(v.string(), InngestAttributeValue),
  ]),
);

const InngestFields = v.objectWithRest(
  { err: v.optional(v.custom<Error>(Error.isError)) },
  InngestAttributeValue,
);
type InngestFields = v.InferOutput<typeof InngestFields>;

function parseInngestRecord(value: unknown) {
  let parsed: InngestFields;
  try {
    parsed = v.parse(InngestFields, value);
  } catch (error) {
    if (!v.isValiError(error)) throw error;
    logger.warn(
      'Inngest log attributes failed validation',
      'spectro.inngest.log_parse.exception',
      void 0,
      error,
    );
    return;
  }

  const { err, ...fields } = parsed;
  const attributes: AnyValueMap = {};
  for (const [key, attribute] of Object.entries(fields))
    attributes[`spectro.inngest.${key}`] = attribute;
  return { attributes, error: err };
}

export class InngestLogger {
  #attributes: AnyValueMap;

  constructor(attributes: AnyValueMap) {
    this.#attributes = attributes;
  }

  child(metadata: Record<string, unknown>) {
    const fields = parseInngestRecord(metadata);
    return typeof fields === 'undefined'
      ? this
      : new InngestLogger({ ...this.#attributes, ...fields.attributes });
  }

  debug(...args: unknown[]) {
    this.#log('debug', args);
  }

  info(...args: unknown[]) {
    this.#log('info', args);
  }

  warn(...args: unknown[]) {
    this.#log('warn', args);
  }

  error(...args: unknown[]) {
    this.#log('error', args);
  }

  #log(severity: InngestLogSeverity, args: readonly unknown[]) {
    const attributes = structuredClone(this.#attributes);
    const strings: string[] = [];
    let error: Error | undefined;

    for (const argument of args)
      if (typeof argument === 'string') {
        strings.push(argument);
      } else if (Error.isError(argument)) {
        error = argument;
      } else if (typeof argument !== 'object' || argument === null) {
        const record = parseInngestRecord(argument);
        if (typeof record !== 'undefined') {
          const { attributes: recordAttributes, error: recordError } = record;
          if (typeof recordError !== 'undefined') error = recordError;
          for (const [key, attribute] of Object.entries(recordAttributes))
            attributes[key] = attribute;
        }
      }

    logger[severity](
      strings.length === 0 ? 'Inngest emitted a log' : strings.join('\n\n'),
      'spectro.inngest.log',
      attributes,
      error,
    );
  }
}
