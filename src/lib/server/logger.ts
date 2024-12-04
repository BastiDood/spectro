import { type TransportTargetOptions, pino } from 'pino';

import { AXIOM_DATASET, AXIOM_TOKEN } from '$lib/server/env/axiom';

const targets: TransportTargetOptions[] = [{ target: 'pino/file', options: { destination: 1 } }];
if (typeof AXIOM_DATASET !== 'undefined' && typeof AXIOM_TOKEN !== 'undefined')
    targets.push({ target: '@axiomhq/pino', options: { dataset: AXIOM_DATASET, token: AXIOM_TOKEN } });

export const logger = pino(pino.transport({ targets }));
