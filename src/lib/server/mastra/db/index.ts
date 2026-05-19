import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const DEFAULT_DB_URL = 'file:./mastra.db';

/**
 * Factory for the Mastra libSQL database client.
 */
export function createMastraDb(dbUrl: string = DEFAULT_DB_URL) {
	const client = createClient({ url: dbUrl });
	return drizzle(client, { schema });
}
