import assert from 'node:assert/strict';
import { defineConfig } from 'drizzle-kit';

assert(typeof process.env.POSTGRES_DATABASE_URL !== 'undefined', 'missing postgresql database url');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/server/database/models/index.ts',
  schemaFilter: ['app'],
  dbCredentials: { url: process.env.POSTGRES_DATABASE_URL },
});
