import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProviderKeyWithTrace, AllTiersFailedError } from './tier-router';
import { runWithCache } from './cache';
import * as credentials from './credentials';

vi.mock('./credentials', () => ({
	getUserCredential: vi.fn(),
	PLATFORM_ENV_KEYS: {
		groq: 'GROQ_API_KEY',
		deepseek: 'DEEPSEEK_API_KEY',
		opencode: 'OPENCODE_API_KEY',
		kimchi: 'KIMCHI_API_KEY',
		mistral: 'MISTRAL_API_KEY'
	},
	resolveApiKeyForCredential: vi.fn()
}));

vi.mock('./potluck', () => ({
	findActiveDonationForProvider: vi.fn(),
	getPotluckConfig: vi.fn(),
	parseJsonArray: vi.fn((s: string) => JSON.parse(s))
}));

vi.mock('./admin-model-overrides', () => ({
	listAdminOverrides: vi.fn().mockResolvedValue([])
}));

const envWithAllKeys = {
	GROQ_API_KEY: 'env-groq',
	DEEPSEEK_API_KEY: 'env-deepseek',
	OPENCODE_API_KEY: 'env-opencode',
	KIMCHI_API_KEY: 'env-kimchi',
	MISTRAL_API_KEY: 'env-mistral'
} as Record<string, string | undefined>;

function makeCredential(overrides: Partial<{ enabled: number; encryptedData: string }> = {}) {
	return {
		id: 'cred-1',
		scope: 'user' as const,
		credentialKind: 'personal' as const,
		userId: 1,
		schoolId: null,
		providerId: 'groq',
		encryptedData: 'some-blob',
		priority: 1,
		enabled: 1,
		discoveredModels: null,
		discoveredAt: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides
	};
}

async function withEmptyCache<T>(fn: () => Promise<T>): Promise<T> {
	return runWithCache(fn);
}

describe('resolveProviderKeyWithTrace — tier 1 strict priority', () => {
	beforeEach(() => {
		vi.mocked(credentials.getUserCredential).mockReset();
		vi.mocked(credentials.resolveApiKeyForCredential).mockReset();
		vi.mocked(credentials.resolveApiKeyForCredential).mockImplementation(
			() => null
		);
	});

	it('returns tier 1 with the user key when the credential is valid', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(makeCredential() as any);
		vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue('user-groq');

		const result = await withEmptyCache(() =>
			resolveProviderKeyWithTrace({
				db: {} as any,
				env: envWithAllKeys,
				userId: 1,
				providerId: 'groq' as any,
				schoolId: 1,
				userRole: 'admin'
			})
		);

		expect(result.tier).toBe(1);
		expect(result.source).toBe('user');
		expect(result.apiKey).toBe('user-groq');
	});

	it('does NOT fall through to env when the user credential exists but decrypts to empty', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(makeCredential() as any);
		vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue(null);

		await expect(
			withEmptyCache(() =>
				resolveProviderKeyWithTrace({
					db: {} as any,
					env: envWithAllKeys,
					userId: 1,
					providerId: 'groq' as any,
					schoolId: 1,
					userRole: 'admin'
				})
			)
		).rejects.toBeInstanceOf(AllTiersFailedError);
	});

	it('falls through to env when the user has NO credential at all', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);

		const result = await withEmptyCache(() =>
			resolveProviderKeyWithTrace({
				db: {} as any,
				env: envWithAllKeys,
				userId: 1,
				providerId: 'groq' as any,
				schoolId: 1,
				userRole: 'admin'
			})
		);

		expect(result.tier).toBe(3);
		expect(result.source).toBe('env');
		expect(result.apiKey).toBe('env-groq');
	});

	it('returns tier 1 with credentialEnabled=false when the user credential is disabled (enabled = 0)', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(
			makeCredential({ enabled: 0 }) as any
		);

		// A disabled credential is still "tier 1" — the user explicitly
		// opted out. The router returns tier 1 with an empty key and
		// `credentialEnabled: false`; the resolver then throws
		// `ProviderDisabledError` upstream. The env fallback is NOT used.
		const result = await withEmptyCache(() =>
			resolveProviderKeyWithTrace({
				db: {} as any,
				env: envWithAllKeys,
				userId: 1,
				providerId: 'groq' as any,
				schoolId: 1,
				userRole: 'admin'
			})
		);

		expect(result.tier).toBe(1);
		expect(result.source).toBe('user');
		expect(result.credentialEnabled).toBe(false);
		expect(result.apiKey).toBe('');
	});
});
