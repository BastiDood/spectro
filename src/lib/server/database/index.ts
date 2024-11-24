import type * as models from './models';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase<typeof models>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
