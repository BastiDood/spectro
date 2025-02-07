import { ORIGIN } from '$lib/env';

export const prerender = true;

export function GET() {
    const urls = ['', 'guide/', 'reference/', 'privacy/']
        .map(
            path =>
                `<url><loc>${ORIGIN.origin}/${path}</loc><changefreq>daily</changefreq><priority>0.5</priority></url>`,
        )
        .join('');
    return new Response(
        `<?xml version="1.0" encoding="UTF-8" ?><urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="https://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="https://www.w3.org/1999/xhtml" xmlns:mobile="https://www.google.com/schemas/sitemap-mobile/1.0" xmlns:image="https://www.google.com/schemas/sitemap-image/1.1" xmlns:video="https://www.google.com/schemas/sitemap-video/1.1">${urls}</urlset>`,
        { headers: { 'Content-Type': 'application/xml' } },
    );
}
