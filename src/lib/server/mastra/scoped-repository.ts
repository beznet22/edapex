import type { TenantContext } from './tenant-context';
import type { MySQLDrizzleClient } from '../db';

type RepositoryClass<T> = new (db: MySQLDrizzleClient, tenant: TenantContext) => T;

/**
 * Per-request factory that binds Drizzle repositories to a frozen TenantContext.
 * Tools call `provider.getRepo(SomeRepository)` to get an instance pre-scoped
 * to the active school/class/section.
 *
 * This replaces the legacy global singletons in `src/lib/server/repository/index.ts`.
 */
export class ScopedRepositoryProvider {
	private cache = new Map<string, unknown>();

	constructor(
		private readonly db: MySQLDrizzleClient,
		private readonly tenant: TenantContext
	) {}

	getRepo<T>(RepoClass: RepositoryClass<T>): T {
		const key = RepoClass.name;

		if (!this.cache.has(key)) {
			this.cache.set(key, new RepoClass(this.db, this.tenant));
		}

		return this.cache.get(key) as T;
	}

	getService<T>(ServiceClass: new (provider: ScopedRepositoryProvider) => T): T {
		const key = ServiceClass.name;

		if (!this.cache.has(key)) {
			this.cache.set(key, new ServiceClass(this));
		}

		return this.cache.get(key) as T;
	}

	getTenant(): TenantContext {
		return this.tenant;
	}

	getDb(): MySQLDrizzleClient {
		return this.db;
	}
}
