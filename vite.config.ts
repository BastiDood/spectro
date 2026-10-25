import { cwd, env } from 'node:process';

import adapter from '@sveltejs/adapter-vercel';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
  // Override with `ORIGIN`, such as each contributor's tunnel origin in development.
  const { ORIGIN: origin = 'https://spectro.bastidood.dev' } = loadEnv(mode, cwd(), ['ORIGIN']);
  const { hostname } = new URL(origin);
  const allowedHosts = ['web', hostname];
  return {
    plugins: [
      {
        name: 'app-environment-loader',
        config() {
          // Loads OpenTelemetry environment variables into `pnpm dev` and `pnpm preview`.
          // Existing environment variables are not overridden.
          const otel = loadEnv(mode, cwd(), ['OTEL_', 'INNGEST_']);
          for (const [key, value] of Object.entries(otel)) env[key] ??= value;
        },
      },
      tailwind(),
      sveltekit({
        adapter: adapter({ regions: ['iad1'], runtime: 'nodejs24.x', memory: 128 }),
        paths: { origin },
        tracing: { server: true },
      }),
    ],
    server: { host: true, allowedHosts },
    preview: { host: true, allowedHosts },
    test: { environment: 'node' },
  };
});
