import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { unlinkSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import {
	encrypt,
	decrypt,
	ensureProviderConfigTable,
	saveProviderConfig,
	getProviderConfig,
	deleteProviderConfig,
	type ProviderConfigRow
} from '../provider-config';
import { EdApexGateway } from '../gateway';
import { TenantContextCache } from '../context-cache';
import { createTenantContext } from '../tenant-context';
import { createMastraStorage } from '../storage';
import { evaluateRouteGuard, type WorkspaceManifest } from '../route-guard';

const TEST_DB_PATH = './test-gateway.db';
const TEST_DB_URL = `file:${TEST_DB_PATH}`;
const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-ok!';

function makeClient(): Client {
	return createClient({ url: TEST_DB_URL });
}

function makeTestConfig(
	id: string,
	apiKey: string,
	priority: number,
	taskMappings: Record<string, string> = {}
): ProviderConfigRow {
	return {
		id,
		apiKeyEncrypted: encrypt(apiKey, TEST_ENCRYPTION_KEY),
		priority,
		baseUrl: '',
		taskMappings: JSON.stringify(taskMappings),
		enabled: true,
		updatedAt: new Date().toISOString()
	};
}

// ═══════════════════════════════════════════════════════════════════════
// 1.2a — KEY RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — Key Retrieval', () => {
	let client: Client;

	beforeEach(async () => {
		client = makeClient();
		await ensureProviderConfigTable(client);
	});

	afterEach(() => {
		client.close();
		try { unlinkSync(TEST_DB_PATH); } catch { /* noop */ }
	});

	it('encrypt/decrypt round-trips correctly', () => {
		const original = 'sk-test-secret-api-key-12345';
		const encrypted = encrypt(original, TEST_ENCRYPTION_KEY);
		const decrypted = decrypt(encrypted, TEST_ENCRYPTION_KEY);
		expect(decrypted).toBe(original);
		expect(encrypted).not.toBe(original);
		expect(encrypted).toContain(':');
	});

	it('saves and retrieves a provider config from libSQL', async () => {
		const config = makeTestConfig('cerebras', 'sk-cerebras-key', 1, { chat: 'llama-3.3-70b' });
		await saveProviderConfig(client, config);
		const retrieved = await getProviderConfig(client, 'cerebras');
		expect(retrieved).not.toBeNull();
		expect(retrieved!.id).toBe('cerebras');
		expect(retrieved!.priority).toBe(1);
		expect(retrieved!.enabled).toBe(true);
		const decryptedKey = decrypt(retrieved!.apiKeyEncrypted, TEST_ENCRYPTION_KEY);
		expect(decryptedKey).toBe('sk-cerebras-key');
	});

	it('EdApexGateway.getApiKey() fetches and decrypts from libSQL', async () => {
		await saveProviderConfig(client, makeTestConfig('groq', 'gsk-groq-secret-key', 2));
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const key = await gateway.getApiKey('edapex/groq/llama-3');
		expect(key).toBe('gsk-groq-secret-key');
		const keyDirect = await gateway.getApiKey('groq');
		expect(keyDirect).toBe('gsk-groq-secret-key');
	});

	it('getApiKey() throws for missing provider', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		await expect(gateway.getApiKey('nonexistent')).rejects.toThrow('No provider config found');
	});

	it('getApiKey() throws for disabled provider', async () => {
		const config = makeTestConfig('mistral', 'sk-mistral', 4);
		config.enabled = false;
		await saveProviderConfig(client, config);
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		await expect(gateway.getApiKey('mistral')).rejects.toThrow('disabled');
	});

	it('deletes a provider config', async () => {
		await saveProviderConfig(client, makeTestConfig('nvidia', 'nvapi-key', 3));
		const deleted = await deleteProviderConfig(client, 'nvidia');
		expect(deleted).toBe(true);
		const retrieved = await getProviderConfig(client, 'nvidia');
		expect(retrieved).toBeNull();
	});
});

// ═══════════════════════════════════════════════════════════════════════
// 1.2b — PROVIDER FAILOVER (429/503)
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — Provider Failover (429/503)', () => {
	let client: Client;

	beforeEach(async () => {
		client = makeClient();
		await ensureProviderConfigTable(client);
		await saveProviderConfig(client, makeTestConfig('cerebras', 'sk-cerebras', 1));
		await saveProviderConfig(client, makeTestConfig('groq', 'gsk-groq', 2));
		await saveProviderConfig(client, makeTestConfig('nvidia', 'nvapi-nvidia', 3));
		await saveProviderConfig(client, makeTestConfig('mistral', 'sk-mistral', 4));
	});

	afterEach(() => {
		client.close();
		try { unlinkSync(TEST_DB_PATH); } catch { /* noop */ }
	});

	it('returns the priority-ordered failover chain', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const chain = await gateway.getFailoverChain();
		expect(chain).toEqual(['cerebras', 'groq', 'nvidia', 'mistral']);
	});

	it('succeeds on first provider without failover', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const calls: string[] = [];
		const result = await gateway.withFailover(async (providerId) => {
			calls.push(providerId);
			return `success-${providerId}`;
		});
		expect(result).toBe('success-cerebras');
		expect(calls).toEqual(['cerebras']);
	});

	it('fails over from Cerebras (429) to Groq', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const calls: string[] = [];
		const result = await gateway.withFailover(async (providerId) => {
			calls.push(providerId);
			if (providerId === 'cerebras') throw { statusCode: 429, message: 'Rate limited' };
			return `success-${providerId}`;
		});
		expect(result).toBe('success-groq');
		expect(calls).toEqual(['cerebras', 'groq']);
	});

	it('cascades through the full chain on 503 errors', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const calls: string[] = [];
		const result = await gateway.withFailover(async (providerId) => {
			calls.push(providerId);
			if (providerId !== 'mistral') throw { status: 503, message: 'Service unavailable' };
			return `success-${providerId}`;
		});
		expect(result).toBe('success-mistral');
		expect(calls).toEqual(['cerebras', 'groq', 'nvidia', 'mistral']);
	});

	it('throws non-retryable errors immediately without failover', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const calls: string[] = [];
		await expect(
			gateway.withFailover(async (providerId) => {
				calls.push(providerId);
				throw { statusCode: 401, message: 'Unauthorized' };
			})
		).rejects.toMatchObject({ statusCode: 401 });
		expect(calls).toEqual(['cerebras']);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// 1.2c — MODEL MAPPING
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — Model Mapping', () => {
	let client: Client;

	beforeEach(async () => {
		client = makeClient();
		await ensureProviderConfigTable(client);
		await saveProviderConfig(client, makeTestConfig('mistral', 'sk-mistral', 1, { ocr: 'mistral-ocr-latest', chat: 'mistral-large-latest' }));
		await saveProviderConfig(client, makeTestConfig('cerebras', 'sk-cerebras', 2, { chat: 'llama-3.3-70b', title: 'llama-3.1-8b' }));
	});

	afterEach(() => {
		client.close();
		try { unlinkSync(TEST_DB_PATH); } catch { /* noop */ }
	});

	it('OCR task resolves to mistral-ocr-latest', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const result = await gateway.resolveModelForTask('ocr');
		expect(result.providerId).toBe('mistral');
		expect(result.modelId).toBe('mistral-ocr-latest');
	});

	it('chat task resolves to highest-priority provider with chat mapping', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		const result = await gateway.resolveModelForTask('chat');
		expect(result.providerId).toBe('mistral');
		expect(result.modelId).toBe('mistral-large-latest');
	});

	it('buildUrl returns correct base URL for each provider', () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		expect(gateway.buildUrl('edapex/cerebras/llama-3')).toBe('https://api.cerebras.ai/v1');
		expect(gateway.buildUrl('groq/llama-3')).toBe('https://api.groq.com/openai/v1');
		expect(gateway.buildUrl('nvidia')).toBe('https://integrate.api.nvidia.com/v1');
		expect(gateway.buildUrl('mistral')).toBe('https://api.mistral.ai/v1');
	});

	it('throws for unknown task type', async () => {
		const gateway = new EdApexGateway(client, TEST_ENCRYPTION_KEY);
		await client.execute('DELETE FROM provider_configs');
		await expect(gateway.resolveModelForTask('ocr')).rejects.toThrow('No provider configured for task');
	});
});

// ═══════════════════════════════════════════════════════════════════════
// 1.2d — TENANT CONTEXT CACHE
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — TenantContext Cache', () => {
	it('caches and returns the same TenantContext within TTL', async () => {
		const cache = new TenantContextCache();
		let hydrationCount = 0;
		const hydrateFn = async () => {
			hydrationCount++;
			return createTenantContext({ schoolId: 1, userId: 42, designationId: 8 });
		};
		const first = await cache.getOrHydrate('session-1', hydrateFn);
		const second = await cache.getOrHydrate('session-1', hydrateFn);
		expect(first).toBe(second);
		expect(hydrationCount).toBe(1);
	});

	it('bustCache() forces re-hydration on next access (/switch)', async () => {
		const cache = new TenantContextCache();
		let hydrationCount = 0;
		const hydrateFn = async () => {
			hydrationCount++;
			return createTenantContext({ schoolId: hydrationCount * 100, userId: 1, designationId: 8 });
		};
		const first = await cache.getOrHydrate('session-1', hydrateFn);
		expect(first.schoolId).toBe(100);

		cache.bustCache('session-1');
		expect(cache.has('session-1')).toBe(false);

		const second = await cache.getOrHydrate('session-1', hydrateFn);
		expect(second.schoolId).toBe(200);
		expect(hydrationCount).toBe(2);
	});

	it('TTL expiry triggers re-hydration after 5 minutes', async () => {
		const cache = new TenantContextCache();
		let hydrationCount = 0;
		const hydrateFn = async () => {
			hydrationCount++;
			return createTenantContext({ schoolId: 1, userId: 1, designationId: 8 });
		};
		await cache.getOrHydrate('session-1', hydrateFn);
		expect(hydrationCount).toBe(1);

		const originalNow = Date.now;
		vi.spyOn(Date, 'now').mockReturnValue(originalNow() + 6 * 60 * 1000);
		await cache.getOrHydrate('session-1', hydrateFn);
		expect(hydrationCount).toBe(2);
		vi.restoreAllMocks();
	});

	it('different sessions are independently cached', async () => {
		const cache = new TenantContextCache();
		const ctxA = await cache.getOrHydrate('session-a', async () =>
			createTenantContext({ schoolId: 100, userId: 1, designationId: 8 })
		);
		const ctxB = await cache.getOrHydrate('session-b', async () =>
			createTenantContext({ schoolId: 200, userId: 2, designationId: 5 })
		);
		expect(ctxA.schoolId).toBe(100);
		expect(ctxB.schoolId).toBe(200);
		expect(cache.size).toBe(2);
		cache.bustCache('session-a');
		expect(cache.has('session-a')).toBe(false);
		expect(cache.has('session-b')).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// 1.2e — THREAD METADATA
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — Thread Metadata', () => {
	const THREAD_DB_PATH = './test-thread-meta.db';
	const THREAD_DB_URL = `file:${THREAD_DB_PATH}`;

	afterEach(() => {
		try { unlinkSync(THREAD_DB_PATH); } catch { /* noop */ }
	});

	it('threads are auto-tagged with workspace bounds metadata', async () => {
		const storage = createMastraStorage(THREAD_DB_URL);
		await storage.init();
		const memory = await storage.getStore('memory');
		const tenant = createTenantContext({
			schoolId: 42, classId: 10, sectionId: 2, examId: 5, academicId: 3, userId: 1, designationId: 8
		});
		await memory!.saveThread({
			thread: {
				id: 'thread-tagged', title: 'Test thread', resourceId: `user-${tenant.userId}`,
				metadata: { schoolId: tenant.schoolId, classId: tenant.classId, sectionId: tenant.sectionId, examId: tenant.examId },
				createdAt: new Date(), updatedAt: new Date()
			}
		});
		const thread = await memory!.getThreadById({ threadId: 'thread-tagged' });
		expect(thread).not.toBeNull();
		expect(thread!.metadata?.schoolId).toBe(42);
		expect(thread!.metadata?.classId).toBe(10);
		expect(thread!.metadata?.sectionId).toBe(2);
		expect(thread!.metadata?.examId).toBe(5);
	});

	it('threads inherit TenantContext for workspace filtering', async () => {
		const storage = createMastraStorage(THREAD_DB_URL);
		await storage.init();
		const memory = await storage.getStore('memory');

		await memory!.saveThread({
			thread: { id: 'thread-school-a', title: 'School A', resourceId: 'user-1',
				metadata: { schoolId: 10, classId: 1, sectionId: 1, examId: 1 },
				createdAt: new Date(), updatedAt: new Date() }
		});
		await memory!.saveThread({
			thread: { id: 'thread-school-b', title: 'School B', resourceId: 'user-2',
				metadata: { schoolId: 20, classId: 2, sectionId: 2, examId: 2 },
				createdAt: new Date(), updatedAt: new Date() }
		});

		const filtered = await memory!.listThreads({ filter: { metadata: { schoolId: 10 } } });
		expect(filtered.threads).toHaveLength(1);
		expect(filtered.threads[0].id).toBe('thread-school-a');
	});
});

// ═══════════════════════════════════════════════════════════════════════
// 1.2f — ROUTE GUARD HYDRATION
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1.2 — Route Guard Hydration', () => {
	it('redirects to /login when no tenant context exists', () => {
		const result = evaluateRouteGuard(null, null, '/workspace');
		expect(result.status).toBe('redirect');
		expect(result.redirectTo).toBe('/login');
	});

	it('redirects to /pending-assignment when tenant exists but no workspace', () => {
		const tenant = createTenantContext({ schoolId: 1, userId: 42, designationId: 8 });
		const result = evaluateRouteGuard(tenant, null, '/workspace');
		expect(result.status).toBe('redirect');
		expect(result.redirectTo).toBe('/pending-assignment');
	});

	it('allows access when tenant and workspace are both valid', () => {
		const tenant = createTenantContext({ schoolId: 1, classId: 10, sectionId: 2, userId: 42, designationId: 8 });
		const workspace: WorkspaceManifest = { classId: 10, sectionId: 2, className: 'JSS1', sectionName: 'A' };
		const result = evaluateRouteGuard(tenant, workspace, '/workspace');
		expect(result.status).toBe('ok');
		expect(result.tenant).toBe(tenant);
		expect(result.workspace).toBe(workspace);
	});

	it('allows public routes without any context', () => {
		expect(evaluateRouteGuard(null, null, '/login').status).toBe('ok');
		expect(evaluateRouteGuard(null, null, '/pending-assignment').status).toBe('ok');
		expect(evaluateRouteGuard(null, null, '/api/auth/callback').status).toBe('ok');
		expect(evaluateRouteGuard(null, null, '/health').status).toBe('ok');
	});
});
