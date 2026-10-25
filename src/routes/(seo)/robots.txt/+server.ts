export const prerender = true;

export function GET({ url }) {
  const lines = ['User-agent: *', 'Allow: /', '', `Sitemap: ${url.origin}/sitemap.xml`];
  return new Response(lines.join('\n'));
}
