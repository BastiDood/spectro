import { serve } from 'inngest/sveltekit';

import { functions } from './functions';
import { inngest } from './client';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
