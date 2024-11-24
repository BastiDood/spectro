import type { Config } from 'tailwindcss';
export default {
    experimental: { optimizeUniversalDefaults: true },
    content: ['./src/**/*.{html,js,svelte,ts}'],
} satisfies Config;
