import { type TransportTargetOptions, pino } from 'pino';
import { dev } from '$app/environment';

import { AXIOM_DATASET, AXIOM_TOKEN } from '$lib/server/env/axiom';

const targets: TransportTargetOptions[] = [
    dev ? { target: 'pino-pretty', options: { colorize: 1 } } : { target: 'pino/file', options: { destination: 1 } },
];

// Axiom
if (typeof AXIOM_DATASET !== 'undefined' && typeof AXIOM_TOKEN !== 'undefined')
    targets.push({ target: '@axiomhq/pino', options: { dataset: AXIOM_DATASET, token: AXIOM_TOKEN } });

export const logger = pino(pino.transport({ targets }));
