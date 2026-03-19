import { cwd, env } from 'node:process';

import tailwind from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [
    {
      name: 'app-environment-loader',
      config(_, { mode }) {
        // Loads OpenTelemetry environment variables into `pnpm dev` and `pnpm preview`.
        // Existing environment variables are not overridden.
        const otel = loadEnv(mode, cwd(), ['OTEL_', 'INNGEST_']);
        for (const [key, value] of Object.entries(otel)) env[key] ??= value;
      },
    },
    tailwind(),
    sveltekit(),
  ],
  server: { host: true, allowedHosts: ['host.docker.internal'] },
  preview: { host: true, allowedHosts: ['host.docker.internal'] },
});
