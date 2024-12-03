import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { customType } from 'drizzle-orm/pg-core';

const HEX_PREFIX = '\\x';

export const bytea = customType<{ data: Buffer; driverData: string }>({
    dataType() {
        return 'bytea';
    },
    toDriver(val) {
        return HEX_PREFIX + val.toString('hex');
    },
    fromDriver(val) {
        assert(val.startsWith(HEX_PREFIX));
        const hex = val.slice(HEX_PREFIX.length);
        return Buffer.from(hex, 'hex');
    },
});
