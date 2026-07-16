/**
 * App-level Mastra Database — EdApex
 *
 * Drizzle-typed libSQL client owning the **application's** tables:
 *   - user_credentials, user_model_visibility, agent_settings,
 *     mastra_runs, mastra_run_steps
 *
 * These are NOT the same as the Mastra framework's tables (mastra_threads,
 * mastra_messages, etc.) which are owned by LibSQLStore in storage.ts.
 *
 * Both clients point at the SAME physical file (./mastra.db) so that:
 *   1. One WAL, one backup target, one file lock
 *   2. Cross-domain queries (e.g. join mastra_runs to mastra_threads) are
 *      possible via raw SQL if ever needed
 *
 * SQLite WAL + busy_timeout is applied on the first Drizzle connection so
 * the two libSQL clients in this process (Drizzle + LibSQLStore) can coexist
 * without `SQLITE_BUSY` failures.
 *
 * Use `getAppDb()` everywhere — it returns a process-wide singleton. Do NOT
 * call `createClient()` directly; the WAL pragmas are applied only by this
 * factory and bypassed otherwise.
 */
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import * as schema from './app-db.schema';

const DEFAULT_DB_URL = 'file:./mastra.db';
const DB_URL = process.env.MASTRA_DB_URL ?? DEFAULT_DB_URL;

let _sharedClient: Client | null = null;
let _sharedDb: LibSQLDatabase<typeof schema> | null = null;
let _pragmasApplied = false;

function applyPragmas(client: Client): void {
	if (_pragmasApplied) return;
	// WAL allows concurrent readers + one writer. busy_timeout makes the second
	// writer wait up to 5s for the lock instead of failing immediately.
	client.execute('PRAGMA journal_mode = WAL');
	client.execute('PRAGMA synchronous = NORMAL');
	client.execute('PRAGMA busy_timeout = 5000');
	_pragmasApplied = true;
}

export function getClient(): Client {
	if (!_sharedClient) {
		_sharedClient = createClient({ url: DB_URL });
		applyPragmas(_sharedClient);
	}
	return _sharedClient;
}

export function getAppDb(): LibSQLDatabase<typeof schema> {
	if (!_sharedDb) {
		_sharedDb = drizzle(getClient(), { schema });
	}
	return _sharedDb;
}

export { schema };
