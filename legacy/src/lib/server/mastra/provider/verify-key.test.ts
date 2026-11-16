import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials, type EncryptedCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	saveUserCredential,
	type SaveUserCredentialInput
} from './credentials';
import { verifyApiKey, VerificationError } from './verify-key';
import type { ProviderId } from './types';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const envKey = 'test-encryption-key-32bytes!';
const env = { TOKEN_ENCRYPTION_KEY: envKey };

async function cleanupUser(userId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));
}

function makeFetch(impl: (url: string) => Promise<Response>): typeof fetch {
	return vi.fn(async (input) => impl(String(input))) as unknown as typeof fetch;
}

function okJson(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('verifyApiKey', () => {
	it('returns ok + models on 2xx with a non-empty data array', async () => {
		const fetchImpl = makeFetch(async () =>
			okJson({ data: [{ id: 'm1', name: 'Model 1' }, { id: 'm2' }] })
		);
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-test',
			fetchImpl
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.models.map((m) => m.id)).toEqual(['groq/m1', 'groq/m2']);
		}
	});

	it('returns ok with empty models on 2xx with empty data', async () => {
		const fetchImpl = makeFetch(async () => okJson({ data: [] }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-test',
			fetchImpl
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.models).toEqual([]);
	});

	it('classifies 401 as auth_failed, not recoverable', async () => {
		const fetchImpl = makeFetch(async () => new Response('nope', { status: 401 }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'bad',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('auth_failed');
			expect(result.recoverable).toBe(false);
			expect(result.status).toBe(401);
		}
	});

	it('classifies 403 as forbidden, not recoverable', async () => {
		const fetchImpl = makeFetch(async () => new Response('nope', { status: 403 }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'bad',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('forbidden');
			expect(result.recoverable).toBe(false);
		}
	});

	it('classifies 429 as rate_limited, recoverable', async () => {
		const fetchImpl = makeFetch(async () => new Response('nope', { status: 429 }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'ok',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('rate_limited');
			expect(result.recoverable).toBe(true);
		}
	});

	it('classifies 5xx as upstream_error, recoverable', async () => {
		const fetchImpl = makeFetch(async () => new Response('boom', { status: 503 }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'ok',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('upstream_error');
			expect(result.recoverable).toBe(true);
		}
	});

	it('classifies network errors as network_error, recoverable', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'ok',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('network_error');
			expect(result.recoverable).toBe(true);
		}
	});

	it('classifies malformed JSON 2xx as invalid_response, recoverable', async () => {
		const fetchImpl = makeFetch(async () => new Response('not-json', { status: 200 }));
		const result = await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'ok',
			fetchImpl
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe('invalid_response');
			expect(result.recoverable).toBe(true);
		}
	});

	it('sends the Authorization header when an apiKey is provided', async () => {
		const fetchImpl = makeFetch(async () => okJson({ data: [] }));
		await verifyApiKey({
			providerId: 'groq' as ProviderId,
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-abc',
			fetchImpl
		});
		const call = vi.mocked(fetchImpl).mock.calls[0];
		expect(call).toBeDefined();
		const init = call?.[1] as RequestInit | undefined;
		const headers = init?.headers as Record<string, string> | undefined;
		expect(headers?.Authorization).toBe('Bearer gsk-abc');
	});
});

describe('saveUserCredential verification gate', () => {
	beforeEach(async () => {
		await cleanupUser(11);
		await cleanupUser(12);
		await cleanupUser(13);
	});

	afterEach(async () => {
		await cleanupUser(11);
		await cleanupUser(12);
		await cleanupUser(13);
		vi.restoreAllMocks();
	});

	function buildInput(overrides: Partial<SaveUserCredentialInput> = {}): SaveUserCredentialInput {
		return {
			userId: 11,
			providerId: 'groq' as ProviderId,
			credentialType: 'credential',
			apiKey: 'gsk-test',
			...overrides
		};
	}

	it('throws VerificationError on 4xx and does NOT write to DB', async () => {
		const fetchImpl = makeFetch(async () => new Response('unauthorized', { status: 401 }));
		const db = getAppDb();
		await expect(
			saveUserCredential(db, env, buildInput({ fetchImpl }))
		).rejects.toBeInstanceOf(VerificationError);

		const rows = await db
			.select()
			.from(encryptedCredentials)
			.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, 11)));
		expect(rows).toHaveLength(0);
	});

	it('proceeds with save on 5xx and returns a warning', async () => {
		const fetchImpl = makeFetch(async () => new Response('down', { status: 503 }));
		const db = getAppDb();
		const result = await saveUserCredential(db, env, buildInput({ fetchImpl }));
		expect(result.warning).toBeDefined();
		expect(result.warning).toMatch(/upstream/i);
		expect(result.credential.providerId).toBe('groq');
	});

	it('proceeds with save on network error and returns a warning', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		const db = getAppDb();
		const result = await saveUserCredential(db, env, buildInput({ fetchImpl }));
		expect(result.warning).toBeDefined();
		expect(result.warning).toMatch(/reach|upstream/i);
	});

	it('reuses verified models instead of running discovery twice', async () => {
		const fetchImpl = makeFetch(async () =>
			okJson({ data: [{ id: 'm-verified', name: 'Verified Model' }] })
		);
		const db = getAppDb();
		await saveUserCredential(db, env, buildInput({ fetchImpl }));
		expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
	});

	it('skips verification entirely when no new apiKey is provided', async () => {
		const fetchImpl = makeFetch(async () => {
			throw new Error('should not be called');
		}) as unknown as typeof fetch;
		const db = getAppDb();
		// Seed an existing row.
		const seedFetch = makeFetch(async () => okJson({ data: [] }));
		await saveUserCredential(db, env, buildInput({ fetchImpl: seedFetch }));

		// Now update without supplying apiKey — verification must NOT run.
		await saveUserCredential(
			db,
			env,
			buildInput({ apiKey: undefined, priority: 9, fetchImpl })
		);
		expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
	});

	it('persists discovered models from a successful verification', async () => {
		const fetchImpl = makeFetch(async () =>
			okJson({
				data: [
					{ id: 'm-verified-a', name: 'A' },
					{ id: 'm-verified-b', name: 'B' }
				]
			})
		);
		const db = getAppDb();
		const result = await saveUserCredential(db, env, buildInput({ fetchImpl }));
		expect(result.credential.discoveredModels).toBeTruthy();
	});
});
