/** @import { Config } from '@sveltejs/kit'; */

import adapter from '@sveltejs/adapter-cloudflare';

/** @type {Config} */
export default {
  kit: {
    adapter: adapter(),
    experimental: {
      tracing: { server: true },
      instrumentation: { server: true },
    },
  },
};
