import { ORIGIN } from '$lib/env';

export const prerender = true;

export function GET() {
  const lines = ['User-agent: *', 'Allow: /', '', `Sitemap: ${ORIGIN.origin}/sitemap.xml`];
  return new Response(lines.join('\n'));
}
