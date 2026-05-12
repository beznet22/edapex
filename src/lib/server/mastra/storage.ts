import { LibSQLStore } from '@mastra/libsql';

const MASTRA_STORAGE_ID = 'edapex-mastra';
const DEFAULT_DB_URL = 'file:./mastra.db';

/**
 * Non-singleton factory — each invocation returns a fresh LibSQLStore.
 * Required by architectural constraint: no global singletons for Mastra.
 */
export function createMastraStorage(dbUrl: string = DEFAULT_DB_URL): LibSQLStore {
	return new LibSQLStore({
		id: MASTRA_STORAGE_ID,
		url: dbUrl
	});
}
