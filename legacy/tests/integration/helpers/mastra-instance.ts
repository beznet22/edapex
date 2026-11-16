import { vi } from 'vitest';
import { LibSQLStore } from '@mastra/libsql';

/**
 * Test-only override for the mastra storage factory.
 *
 * The singleton `_sharedStorage` inside `$lib/server/mastra/storage/libsql/mastra-storage`
 * opens a file-backed LibSQL connection on first call. For tests we MUST NOT touch
 * the production `mastra.db` file — every test must run against an isolated in-memory
 * database that is automatically discarded when the worker process exits.
 *
 * Vitest hoists `vi.mock` calls to the top of the file. Because this helper is
 * imported FIRST by every test file (see test files' first line), the mock is
 * registered before any module that calls `createMastraStorage()` (i.e. the
 * `assistantAgent`, the `mastra` singleton, the storage-based `Memory` instance)
 * is loaded. The result: a per-worker `:memory:` LibSQL store that all agents
 * and the Mastra instance share for the duration of the test file.
 *
 * `?cache=shared` lets multiple connections within the same process see the same
 * in-memory database; without it, the `Mastra` instance and the `Memory` instance
 * inside the agent would each get their own isolated memory.
 */
vi.mock('$lib/server/mastra/storage/libsql/mastra-storage', () => ({
	createMastraStorage: () =>
		new LibSQLStore({ id: 'test-memory', url: 'file::memory:?cache=shared' }),
	ensureStorageInitialized: async () => {}
}));

// Re-export the singleton after the mock is registered so tests get a Mastra
// instance backed by the in-memory store.
export { mastra } from '$lib/server/mastra';
export { getMastra } from '$lib/server/mastra';
export { ensureStorageInitialized } from '$lib/server/mastra/storage/libsql/mastra-storage';
