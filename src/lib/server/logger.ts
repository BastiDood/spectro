import { AssertionError } from 'node:assert/strict';

import { type Logger, type TransportTargetOptions, pino } from 'pino';
import { isValiError, summarize } from 'valibot';

import { building, dev } from '$app/environment';

const targets: TransportTargetOptions[] = [];
if (dev || building) {
    targets.push({ target: 'pino-pretty', options: { colorize: 1 } });
} else {
    targets.push({ target: 'pino/file', options: { destination: 1 } });
    const { AXIOM_DATASET, AXIOM_TOKEN } = await import('$lib/server/env/axiom');
    if (typeof AXIOM_DATASET !== 'undefined' && typeof AXIOM_TOKEN !== 'undefined')
        targets.push({ target: '@axiomhq/pino', options: { dataset: AXIOM_DATASET, token: AXIOM_TOKEN } });
}

export const logger = pino(pino.transport({ targets }));

export function handleFatalError(logger: Logger, error: unknown): never {
    if (isValiError(error)) {
        logger.fatal({ summary: summarize(error.issues) }, error.message);
    } else if (error instanceof AssertionError) {
        logger.fatal({ nodeAssertionError: error }, error.message);
    } else if (error instanceof Error) {
        logger.fatal({ error }, error.message);
    } else {
        logger.fatal({ unknownError: error });
    }
    throw error;
}
