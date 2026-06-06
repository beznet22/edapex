import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("$env/dynamic/private", () => ({
	env: { DATABASE_URL: "mysql://test@localhost:3306/test" },
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => ({}),
}));

import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext, type TenantContext } from "$lib/server/mastra/tenant-context";
import { BaseRepository } from "$lib/server/repository/base.repo";

/**
 * Slice 9: BaseRepository cache refactor — module-level Map → per-request provider.
 *
 * Bug (B-class): process-global Map<schoolId, ConfigurationCache> leaks
 * configuration state across requests. With concurrent requests for
 * different schools sharing the same Map, race conditions and stale
 * reads are possible. The fix is to move the cache onto
 * ScopedRepositoryProvider so it dies with the request.
 */

const TENANT_A: TenantContext = createTenantContext({ schoolId: 1, userId: 100 });
const TENANT_B: TenantContext = createTenantContext({ schoolId: 2, userId: 200 });

const MOCK_GENERAL = [{ id: 1, schoolId: 1, key: "g1", value: "v1" }];
const MOCK_YEARS = [{ id: 1, schoolId: 1, startingDate: null, endingDate: null, activeStatus: 1 }];
const MOCK_EXAM_TYPES = [{ id: 1, schoolId: 1, title: "Term 1" }];

function makeMockDb() {
	const db: any = {
		select: vi.fn(),
	};
	const data = [MOCK_GENERAL, MOCK_YEARS, MOCK_EXAM_TYPES];
	let call = 0;
	db.select.mockImplementation(() => {
		const idx = call;
		call += 1;
		// A fluent chain: select().from().where() resolves to data[idx].
		// select().from().where().orderBy() also resolves to data[idx].
		const makeThenable = (rows: any) => {
			const p: any = Promise.resolve(rows);
			p.orderBy = () => Promise.resolve(rows);
			return p;
		};
		const whereChain: any = () => makeThenable(data[idx % 3]);
		whereChain.orderBy = () => makeThenable(data[idx % 3]);
		return {
			from: () => ({
				where: whereChain,
			}),
		};
	});
	return db;
}

class TestRepo extends BaseRepository {
	constructor(db: any, tenant: TenantContext, provider?: ScopedRepositoryProvider) {
		super(db, tenant, provider);
	}
	getDb() {
		return this.db;
	}
	getProvider() {
		return (this as any).provider;
	}
	async callLoadConfigurations(forceRefresh = false) {
		return this.loadConfigurations(forceRefresh);
	}
}

describe("Slice 9: BaseRepository cache — module-level Map → per-request provider", () => {
	describe("module-level state audit", () => {
		it("base.repo.ts no longer declares a module-level `let configCache` Map", () => {
			const source = readFileSync(
				join(process.cwd(), "src/lib/server/repository/base.repo.ts"),
				"utf-8",
			);
			expect(source).not.toMatch(/^let\s+configCache\b/m);
			expect(source).not.toMatch(/^const\s+configCache\b/m);
		});

		it("base.repo.ts no longer declares a module-level `Map<number, ConfigurationCache>`", () => {
			const source = readFileSync(
				join(process.cwd(), "src/lib/server/repository/base.repo.ts"),
				"utf-8",
			);
			expect(source).not.toMatch(/Map<number,\s*ConfigurationCache>/);
		});

		it("base.repo.ts no longer exports clearConfigCache (or it is a per-provider no-op)", () => {
			const source = readFileSync(
				join(process.cwd(), "src/lib/server/repository/base.repo.ts"),
				"utf-8",
			);
			// clearConfigCache was process-global. Either removed, or it now
			// delegates to a per-provider cache.
			const match = source.match(/clearConfigCache\s*\(\s*\)\s*:\s*\w+\s*\{[\s\S]*?\}/);
			if (match) {
				expect(match[0]).toMatch(/provider|this\.provider/);
			}
		});
	});

	describe("ScopedRepositoryProvider per-request cache API", () => {
		it("provider exposes getConfigCache() returning null when no cache exists yet", () => {
			const provider = new ScopedRepositoryProvider({} as any, TENANT_A);
			expect(typeof (provider as any).getConfigCache).toBe("function");
			expect((provider as any).getConfigCache()).toBeNull();
		});

		it("provider exposes setConfigCache(cache) to update the per-request cache", () => {
			const provider = new ScopedRepositoryProvider({} as any, TENANT_A);
			const cache = {
				generalSettings: MOCK_GENERAL,
				academicYears: MOCK_YEARS,
				examTypes: MOCK_EXAM_TYPES,
				activeAcademicYear: null,
				lastUpdated: Date.now(),
			};
			(provider as any).setConfigCache(cache);
			expect((provider as any).getConfigCache()).toBe(cache);
		});
	});

	describe("BaseRepository integration with provider", () => {
		it("BaseRepository constructor accepts an optional 3rd provider parameter", () => {
			const db = makeMockDb();
			const provider = new ScopedRepositoryProvider(db, TENANT_A);
			const repo = new TestRepo(db, TENANT_A, provider);
			expect(repo.getProvider()).toBe(provider);
		});

		it("BaseRepository constructor works without a provider (no caching fallback)", () => {
			const db = makeMockDb();
			const repo = new TestRepo(db, TENANT_A);
			expect(repo.getProvider()).toBeUndefined();
		});

		it("loadConfigurations writes the cache to the provider, not a module-level Map", async () => {
			const db = makeMockDb();
			const provider = new ScopedRepositoryProvider(db, TENANT_A);
			const repo = new TestRepo(db, TENANT_A, provider);
			await repo.callLoadConfigurations();
			const cache = (provider as any).getConfigCache();
			expect(cache).not.toBeNull();
			expect(cache.lastUpdated).toBeGreaterThan(0);
			expect(cache.generalSettings).toEqual(MOCK_GENERAL);
			expect(cache.academicYears).toEqual(MOCK_YEARS);
		});

		it("loadConfigurations second call within TTL reuses the provider cache (no second DB hit)", async () => {
			const db = makeMockDb();
			const provider = new ScopedRepositoryProvider(db, TENANT_A);
			const repo = new TestRepo(db, TENANT_A, provider);
			await repo.callLoadConfigurations();
			const selectCallCount = db.select.mock.calls.length;
			await repo.callLoadConfigurations();
			expect(db.select.mock.calls.length).toBe(selectCallCount);
		});

		it("loadConfigurations with forceRefresh=true bypasses the provider cache", async () => {
			const db = makeMockDb();
			const provider = new ScopedRepositoryProvider(db, TENANT_A);
			const repo = new TestRepo(db, TENANT_A, provider);
			await repo.callLoadConfigurations();
			const selectCallCount = db.select.mock.calls.length;
			await repo.callLoadConfigurations(true);
			expect(db.select.mock.calls.length).toBeGreaterThan(selectCallCount);
		});

		it("two providers with different tenants have isolated caches (no cross-tenant leak)", async () => {
			const dbA = makeMockDb();
			const dbB = makeMockDb();
			const providerA = new ScopedRepositoryProvider(dbA, TENANT_A);
			const providerB = new ScopedRepositoryProvider(dbB, TENANT_B);
			const repoA = new TestRepo(dbA, TENANT_A, providerA);
			const repoB = new TestRepo(dbB, TENANT_B, providerB);
			await repoA.callLoadConfigurations();
			const cacheA = (providerA as any).getConfigCache();
			const cacheB = (providerB as any).getConfigCache();
			expect(cacheA).not.toBeNull();
			expect(cacheB).toBeNull();
		});
	});
});
