import { defineConfig } from 'vite';
import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';

import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig({
    plugins: [sveltekit(), purgeCss()],
    css: { postcss: { plugins: [tailwindcss, autoprefixer] } },
});
