import { env } from '$env/dynamic/private';

export const SPECTRO_DATABASE_DRIVER = env.DATABASE_DRIVER ?? 'pg';
