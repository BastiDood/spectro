import { serve } from 'inngest/sveltekit';

import { INNGEST_SIGNING_KEY } from '$lib/server/env/inngest';

import { inngest } from './client';
import { functions } from './functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  signingKey: INNGEST_SIGNING_KEY,
});
