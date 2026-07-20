import { LibSQLStore } from '@mastra/libsql';
import { resolveDbUrl } from './db-url';

const MASTRA_STORAGE_ID = 'edapex-mastra';
const DEFAULT_DB_URL = resolveDbUrl();

let _sharedStorage: LibSQLStore | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Module-level singleton for the LibSQLStore connection.
 * 
 * SQLite (even in WAL mode) does NOT support multiple concurrent writer connections
 * from the same process. Creating a new LibSQLStore per request causes WAL corruption
 * (SQLITE_IOERR_SHORT_READ) because each instance opens its own connection.
 * 
 * The Mastra instance is still per-request (for TenantContext isolation), but all
 * instances share this single storage connection. This is safe because:
 * - LibSQLStore handles serialization of writes internally
 * - TenantContext isolation is enforced at the query level (threadId, resourceId), not connection level
 */
export function createMastraStorage(dbUrl: string = DEFAULT_DB_URL): LibSQLStore {
	if (!_sharedStorage) {
		_sharedStorage = new LibSQLStore({
			id: MASTRA_STORAGE_ID,
			url: dbUrl
		});
		_initPromise = _sharedStorage.init().catch((err: unknown) => {
			console.error('[mastra-storage] Init failed:', err);
		});
	}
	return _sharedStorage;
}

/**
 * Awaits the initial table creation. Call this before any read/write to ensure
 * the schema exists. Safe to call multiple times — resolves immediately after
 * the first init completes.
 */
export async function ensureStorageInitialized(): Promise<void> {
	if (!_sharedStorage) {
		createMastraStorage();
	}
	if (_initPromise) {
		await _initPromise;
	}
}
