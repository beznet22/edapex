import type { TenantContext } from './tenant-context';
import type { MySQLDrizzleClient } from '../db';
import type { ConfigurationCache } from '../repository/base.repo';

type RepositoryClass<T> = new (db: MySQLDrizzleClient, tenant: TenantContext, provider?: ScopedRepositoryProvider) => T;

/**
 * Per-request factory that binds Drizzle repositories to a frozen TenantContext.
 * Tools call `provider.getRepo(SomeRepository)` to get an instance pre-scoped
 * to the active school/class/section.
 *
 * This replaces the legacy global singletons in `src/lib/server/repository/index.ts`.
 *
 * Slice 9: also owns the per-request ConfigurationCache (general settings,
 * academic years, exam types). The cache is bound to the provider's lifetime
 * — when the request ends, the cache is GC'd with the provider. This replaces
 * the previous process-global `Map<schoolId, ConfigurationCache>`.
 */
export class ScopedRepositoryProvider {
	private repoCache = new Map<string, unknown>();
	private configCache: ConfigurationCache | null = null;

	constructor(
		private readonly db: MySQLDrizzleClient,
		private readonly tenant: TenantContext
	) {}

	getRepo<T>(RepoClass: RepositoryClass<T>): T {
		const key = RepoClass.name;

		if (!this.repoCache.has(key)) {
			this.repoCache.set(key, new RepoClass(this.db, this.tenant, this));
		}

		return this.repoCache.get(key) as T;
	}

	getService<T>(ServiceClass: new (provider: ScopedRepositoryProvider) => T): T {
		const key = ServiceClass.name;

		if (!this.repoCache.has(key)) {
			this.repoCache.set(key, new ServiceClass(this));
		}

		return this.repoCache.get(key) as T;
	}

	getTenant(): TenantContext {
		return this.tenant;
	}

	getDb(): MySQLDrizzleClient {
		return this.db;
	}

	getConfigCache(): ConfigurationCache | null {
		return this.configCache;
	}

	setConfigCache(cache: ConfigurationCache): void {
		this.configCache = cache;
	}
}
