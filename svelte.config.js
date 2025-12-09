/** @import { Config } from '@sveltejs/kit'; */

import adapter from '@sveltejs/adapter-node';

/** @type {Config} */
export default {
  kit: {
    adapter: adapter({ precompress: true }),
    experimental: {
      tracing: { server: true },
      instrumentation: { server: true },
    },
  },
};
