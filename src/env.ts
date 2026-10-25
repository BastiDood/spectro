import { Buffer } from 'node:buffer';

import { defineEnvVars } from '@sveltejs/kit/env';
import { hexadecimal, length, picklist, pipe, string, transform, url } from 'valibot';

export const variables = defineEnvVars({
  SPECTRO_DATABASE_DRIVER: {
    static: true,
    description:
      'Database driver: `pg` for a local PostgreSQL server or `neon` for Neon serverless.',
    schema: picklist(['pg', 'neon']),
  },
  DISCORD_PUBLIC_KEY: {
    description: 'Hex-encoded Ed25519 public key of the Discord application.',
    schema: pipe(
      string(),
      hexadecimal(),
      length(64),
      transform(hex => Buffer.from(hex, 'hex')),
    ),
  },
  DISCORD_BOT_TOKEN: { description: 'Discord bot token.' },
  POSTGRES_DATABASE_URL: {
    description: 'PostgreSQL connection string.',
    schema: pipe(string(), url()),
  },
});
