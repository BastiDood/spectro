import { serve } from 'inngest/sveltekit';

import { functions } from './functions/index.ts';
import { inngest } from './client/index.ts';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
