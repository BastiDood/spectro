/** @import { Config } from '@sveltejs/kit'; */

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

import pkg from './package.json' with { type: 'json' };

/** @type {Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ precompress: true }),
    version: { name: pkg.version },
    experimental: {
      tracing: { server: true },
      instrumentation: { server: true },
    },
  },
};
