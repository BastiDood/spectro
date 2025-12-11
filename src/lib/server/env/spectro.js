import { env } from '$env/dynamic/private';

export const SPECTRO_DATABASE_DRIVER = env.SPECTRO_DATABASE_DRIVER ?? 'pg';
