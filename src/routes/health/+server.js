import assert from 'node:assert/strict';

export function GET({ locals: { ctx } }) {
    assert(typeof ctx !== 'undefined');
    ctx.logger.trace('health check pinged');
    return new Response(null, { status: 200 });
}
