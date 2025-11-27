import { serve } from 'inngest/sveltekit';

import { inngest } from './client';
import { functions } from './functions';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
