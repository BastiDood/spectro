import { redirect } from '@sveltejs/kit';

import favicon from '$lib/brand/favicon.ico?url';

export const prerender = true;

export function GET() {
    redirect(307, favicon);
}
