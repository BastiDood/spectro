import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as models from './models';

export type Database = NodePgDatabase<typeof models>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
