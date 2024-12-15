import { ORIGIN } from '$lib/server/env/svelte';

export const prerender = true;

export function GET() {
    const lines = ['User-agent: *', 'Allow: /', '', `Sitemap: ${ORIGIN.origin}/sitemaps.xml`];
    return new Response(lines.join('\n'));
}
