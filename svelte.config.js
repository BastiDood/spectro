/** @import { Config } from '@sveltejs/kit'; */

import adapter from '@sveltejs/adapter-vercel';

/** @type {Config} */
export default {
  kit: {
    adapter: adapter({ regions: ['iad1'], runtime: 'nodejs24.x', memory: 128 }),
    experimental: {
      tracing: { server: true },
      instrumentation: { server: true },
    },
  },
};
