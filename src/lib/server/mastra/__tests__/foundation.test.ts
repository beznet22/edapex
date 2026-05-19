import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { LibSQLStore } from '@mastra/libsql';
import { Mastra } from '@mastra/core';
import { createMastraStorage } from '../storage';
import { createMastraInstance } from '../index';
import { createTenantContext, type TenantContext } from '../tenant-context';
import { ScopedRepositoryProvider } from '../scoped-repository';
import type { MySQLDrizzleClient } from '../../db';

describe('Phase 1.1 — libSQL Initialization', () => {
	let testDbPath: string;
	let testDbUrl: string;

	beforeEach(() => {
		mkdirSync('./temp_dir', { recursive: true });
		testDbPath = `./temp_dir/test-mastra-init-${randomUUID()}.db`;
		testDbUrl = `file:${testDbPath}`;
	});

	afterEach(() => {
		try { unlinkSync(testDbPath); } catch {}
	});

	it('creates the database file on disk after LibSQLStore initialization', async () => {
		expect(existsSync(testDbPath)).toBe(false);

		const storage = new LibSQLStore({
			id: 'test-init',
			url: testDbUrl
		});

		await storage.init();

		expect(existsSync(testDbPath)).toBe(true);
	});

	it('creates Mastra schema tables inside the database', async () => {
		const storage = new LibSQLStore({
			id: 'test-schema',
			url: testDbUrl
		});

		await storage.init();

		const client = createClient({ url: testDbUrl });
		const result = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
		);

		const tableNames = result.rows.map((r) => r.name as string);

		expect(tableNames.length).toBeGreaterThan(0);
		expect(tableNames.some((t) => t.includes('memory') || t.includes('thread'))).toBe(true);
		expect(tableNames.some((t) => t.includes('workflow'))).toBe(true);

		client.close();
	});

	it('returns a functional storage via the createMastraStorage factory', async () => {
		const storage = createMastraStorage(testDbUrl);

		expect(storage).toBeInstanceOf(LibSQLStore);

		await storage.init();

		expect(existsSync(testDbPath)).toBe(true);
	});

	it('mounts cleanly onto a Mastra instance via getStorage()', async () => {
		const storage = createMastraStorage(testDbUrl);
		await storage.init();

		const mastra = new Mastra({
			storage
		});

		const retrievedStorage = mastra.getStorage();

		expect(retrievedStorage).toBeDefined();
		expect(typeof retrievedStorage!.getStore).toBe('function');

		const memoryDomain = await retrievedStorage!.getStore('memory');
		expect(memoryDomain).toBeDefined();
	});

	it('provides domain-scoped stores (memory, workflows)', async () => {
		const storage = createMastraStorage(testDbUrl);
		await storage.init();

		const memoryStore = await storage.getStore('memory');
		const workflowStore = await storage.getStore('workflows');

		expect(memoryStore).toBeDefined();
		expect(workflowStore).toBeDefined();
	});
});

describe('Phase 1.1 — Singleton Guard', () => {
	let dbAPath: string;
	let dbBPath: string;
	let dbAUrl: string;
	let dbBUrl: string;

	beforeEach(() => {
		dbAPath = `./test-singleton-a-${randomUUID()}.db`;
		dbBPath = `./test-singleton-b-${randomUUID()}.db`;
		dbAUrl = `file:${dbAPath}`;
		dbBUrl = `file:${dbBPath}`;
	});

	afterEach(() => {
		for (const p of [dbAPath, dbBPath]) {
			try { unlinkSync(p); } catch {}
		}
	});

	it('produces distinct Mastra instances on each call', () => {
		const resultA = createMastraInstance({ dbUrl: dbAUrl });
		const resultB = createMastraInstance({ dbUrl: dbBUrl });

		expect(resultA.mastra).not.toBe(resultB.mastra);
		expect(resultA.storage).not.toBe(resultB.storage);
	});

	it('does not export a module-level singleton from the barrel', async () => {
		const barrelExports = await import('../index');

		const exportedValues = Object.values(barrelExports);
		const mastraInstances = exportedValues.filter(
			(v) => v instanceof Mastra
		);

		expect(mastraInstances).toHaveLength(0);
	});

	it('each instance initializes its own isolated storage', async () => {
		const resultA = createMastraInstance({ dbUrl: dbAUrl });
		const resultB = createMastraInstance({ dbUrl: dbBUrl });

		await resultA.storage.init();
		await resultB.storage.init();

		expect(existsSync(dbAPath)).toBe(true);
		expect(existsSync(dbBPath)).toBe(true);

		const storageA = resultA.mastra.getStorage();
		const storageB = resultB.mastra.getStorage();

		expect(storageA).toBeDefined();
		expect(storageB).toBeDefined();
		expect(storageA).not.toBe(storageB);
	});
});

describe('Phase 1.1 — Concurrent Isolation', () => {
	let sharedDbPath: string;
	let sharedDbUrl: string;

	beforeEach(() => {
		sharedDbPath = `./test-concurrent-${randomUUID()}.db`;
		sharedDbUrl = `file:${sharedDbPath}`;
	});

	afterEach(() => {
		try { unlinkSync(sharedDbPath); } catch {}
	});

	it('threads tagged with schoolId=100 are invisible to schoolId=200 queries', async () => {
		const storage = createMastraStorage(sharedDbUrl);
		await storage.init();

		const memory = await storage.getStore('memory');
		expect(memory).toBeDefined();

		const tenantA = { schoolId: '100', classId: '10A' };
		const tenantB = { schoolId: '200', classId: '9B' };

		await memory!.saveThread({
			thread: {
				id: 'thread-tenant-a',
				title: 'TenantA conversation',
				resourceId: 'user-1',
				metadata: tenantA,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		await memory!.saveThread({
			thread: {
				id: 'thread-tenant-b',
				title: 'TenantB conversation',
				resourceId: 'user-2',
				metadata: tenantB,
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		const resultA = await memory!.listThreads({
			filter: { metadata: { schoolId: '100' } }
		});
		expect(resultA.threads).toHaveLength(1);
		expect(resultA.threads[0].id).toBe('thread-tenant-a');
		expect(resultA.threads[0].metadata?.schoolId).toBe('100');

		const resultB = await memory!.listThreads({
			filter: { metadata: { schoolId: '200' } }
		});
		expect(resultB.threads).toHaveLength(1);
		expect(resultB.threads[0].id).toBe('thread-tenant-b');
		expect(resultB.threads[0].metadata?.schoolId).toBe('200');
	});

	it('concurrent thread writes from different tenants do not interleave', async () => {
		const storage = createMastraStorage(sharedDbUrl);
		await storage.init();
		const memory = await storage.getStore('memory');

		const writeA = memory!.saveThread({
			thread: {
				id: 'concurrent-a',
				title: 'School A thread',
				resourceId: 'staff-10',
				metadata: { schoolId: '300' },
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		const writeB = memory!.saveThread({
			thread: {
				id: 'concurrent-b',
				title: 'School B thread',
				resourceId: 'staff-20',
				metadata: { schoolId: '400' },
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		await Promise.all([writeA, writeB]);

		const allThreads = await memory!.listThreads({});
		expect(allThreads.threads).toHaveLength(2);

		const schoolA = await memory!.listThreads({
			filter: { metadata: { schoolId: '300' } }
		});
		expect(schoolA.threads).toHaveLength(1);
		expect(schoolA.threads[0].id).toBe('concurrent-a');

		const schoolB = await memory!.listThreads({
			filter: { metadata: { schoolId: '400' } }
		});
		expect(schoolB.threads).toHaveLength(1);
		expect(schoolB.threads[0].id).toBe('concurrent-b');
	});

	it('messages saved to tenant A thread are not retrievable via tenant B thread', async () => {
		const storage = createMastraStorage(sharedDbUrl);
		await storage.init();
		const memory = await storage.getStore('memory');

		await memory!.saveThread({
			thread: {
				id: 'msg-thread-a',
				title: 'Thread A',
				resourceId: 'user-a',
				metadata: { schoolId: '500' },
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		await memory!.saveThread({
			thread: {
				id: 'msg-thread-b',
				title: 'Thread B',
				resourceId: 'user-b',
				metadata: { schoolId: '600' },
				createdAt: new Date(),
				updatedAt: new Date()
			}
		});

		await memory!.saveMessages({
			messages: [
				{
					id: 'msg-1',
					threadId: 'msg-thread-a',
					resourceId: 'user-a',
					role: 'user' as const,
					content: {
						format: 2,
						parts: [
							{
								type: 'text' as const,
								text: 'Secret data for school 500'
							}
						]
					},
					createdAt: new Date(),
					type: 'text' as const
				}
			]
		});

		const messagesA = await memory!.listMessages({ threadId: 'msg-thread-a' });
		expect(messagesA.messages.length).toBeGreaterThanOrEqual(1);

		const messagesB = await memory!.listMessages({ threadId: 'msg-thread-b' });
		expect(messagesB.messages).toHaveLength(0);
	});
});

class MockStudentRepo {
	constructor(
		public readonly db: MySQLDrizzleClient,
		public readonly tenant: TenantContext
	) {}

	getSchoolId() {
		return this.tenant.schoolId;
	}

	getClassId() {
		return this.tenant.classId;
	}
}

class MockResultRepo {
	constructor(
		public readonly db: MySQLDrizzleClient,
		public readonly tenant: TenantContext
	) {}

	getExamId() {
		return this.tenant.examId;
	}
}

describe('Phase 1.1 — Scoped Repository', () => {
	const mockDb = {} as MySQLDrizzleClient;

	it('createTenantContext produces an immutable, frozen object', () => {
		const ctx = createTenantContext({
			schoolId: 1,
			classId: 10,
			sectionId: 2,
			examId: 5,
			academicId: 3,
			userId: 42,
			designationId: 8
		});

		expect(ctx.schoolId).toBe(1);
		expect(ctx.classId).toBe(10);
		expect(ctx.sectionId).toBe(2);
		expect(ctx.examId).toBe(5);
		expect(Object.isFrozen(ctx)).toBe(true);

		expect(() => {
			(ctx as any).schoolId = 999;
		}).toThrow();
	});

	it('defaults optional fields to null', () => {
		const ctx = createTenantContext({
			schoolId: 1,
			userId: 42,
			designationId: 8
		});

		expect(ctx.classId).toBeNull();
		expect(ctx.sectionId).toBeNull();
		expect(ctx.examId).toBeNull();
		expect(ctx.academicId).toBeNull();
	});

	it('ScopedRepositoryProvider injects schoolId into repositories', () => {
		const ctx = createTenantContext({
			schoolId: 42,
			classId: 10,
			sectionId: 2,
			examId: 5,
			userId: 1,
			designationId: 8
		});

		const provider = new ScopedRepositoryProvider(mockDb, ctx);
		const studentRepo = provider.getRepo(MockStudentRepo);

		expect(studentRepo.getSchoolId()).toBe(42);
		expect(studentRepo.getClassId()).toBe(10);
		expect(studentRepo.tenant.schoolId).toBe(42);
	});

	it('ScopedRepositoryProvider injects examId into result repositories', () => {
		const ctx = createTenantContext({
			schoolId: 1,
			examId: 99,
			userId: 1,
			designationId: 5
		});

		const provider = new ScopedRepositoryProvider(mockDb, ctx);
		const resultRepo = provider.getRepo(MockResultRepo);

		expect(resultRepo.getExamId()).toBe(99);
	});

	it('caches repository instances within the same provider', () => {
		const ctx = createTenantContext({
			schoolId: 1,
			userId: 1,
			designationId: 8
		});

		const provider = new ScopedRepositoryProvider(mockDb, ctx);
		const first = provider.getRepo(MockStudentRepo);
		const second = provider.getRepo(MockStudentRepo);

		expect(first).toBe(second);
	});

	it('different providers with different tenants produce isolated repos', () => {
		const ctxA = createTenantContext({ schoolId: 100, userId: 1, designationId: 8 });
		const ctxB = createTenantContext({ schoolId: 200, userId: 2, designationId: 5 });

		const providerA = new ScopedRepositoryProvider(mockDb, ctxA);
		const providerB = new ScopedRepositoryProvider(mockDb, ctxB);

		const repoA = providerA.getRepo(MockStudentRepo);
		const repoB = providerB.getRepo(MockStudentRepo);

		expect(repoA).not.toBe(repoB);
		expect(repoA.getSchoolId()).toBe(100);
		expect(repoB.getSchoolId()).toBe(200);
	});

	it('getTenant() returns the bound TenantContext', () => {
		const ctx = createTenantContext({
			schoolId: 7,
			classId: 3,
			sectionId: 1,
			examId: 12,
			academicId: 4,
			userId: 55,
			designationId: 1
		});

		const provider = new ScopedRepositoryProvider(mockDb, ctx);

		expect(provider.getTenant()).toBe(ctx);
		expect(provider.getTenant().schoolId).toBe(7);
		expect(provider.getTenant().classId).toBe(3);
		expect(provider.getTenant().sectionId).toBe(1);
		expect(provider.getTenant().examId).toBe(12);
	});
});
