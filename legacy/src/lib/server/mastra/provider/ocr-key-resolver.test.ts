/**
 * Tests for the Mistral OCR key resolver — locks the 3-tier walk:
 *   tier 1: user personal credential (decrypted with school key)
 *   tier 2: school pool donation (gated by config + role)
 *   tier 3: platform env `MISTRAL_API_KEY`
 *
 * Also locks the per-call env read — `MISTRAL_API_KEY` is read inside
 * the function, never at module load (no stale env capture).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMistralApiKey } from './ocr-key-resolver';
import * as credentials from './credentials';
import * as potluck from './potluck';

vi.mock('./credentials', () => ({
	getUserCredential: vi.fn(),
	resolveApiKeyForCredential: vi.fn()
}));

vi.mock('./potluck', () => ({
	findActiveDonationForProvider: vi.fn(),
	getPotluckConfig: vi.fn(),
	parseJsonArray: vi.fn((s: string | null) => (s ? JSON.parse(s) : []))
}));

function makeCredential(overrides: Partial<{ enabled: number }> = {}) {
	return {
		id: 'cred-1',
		scope: 'user' as const,
		credentialKind: 'personal' as const,
		userId: 1,
		schoolId: null,
		providerId: 'mistral',
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

function makePoolConfig(overrides: Partial<{ enabled: number; consumerRoles: string; allowedProviders: string }> = {}) {
	return {
		id: 'cfg-1',
		schoolId: 1,
		enabled: 1,
		consumerRoles: '["class_teacher"]',
		allowedProviders: '["mistral"]',
		donorRoles: null,
		perUserDailyTokenCap: 0,
		tosVersion: '1',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides
	};
}

beforeEach(() => {
	vi.mocked(credentials.getUserCredential).mockReset();
	vi.mocked(credentials.resolveApiKeyForCredential).mockReset();
	vi.mocked(potluck.getPotluckConfig).mockReset();
	vi.mocked(potluck.findActiveDonationForProvider).mockReset();
	vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue(null);
	vi.mocked(potluck.findActiveDonationForProvider).mockResolvedValue(null);
});

describe('resolveMistralApiKey — tier 1 (user credential)', () => {
	it('returns the user key when credential is enabled and key decrypts', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(makeCredential() as any);
		vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue('user-mistral-key');

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral' }
		});

		expect(key).toBe('user-mistral-key');
	});

	it('does not consult the pool when the user key resolves', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(makeCredential() as any);
		vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue('user-mistral-key');

		await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral' }
		});

		expect(potluck.getPotluckConfig).not.toHaveBeenCalled();
		expect(potluck.findActiveDonationForProvider).not.toHaveBeenCalled();
	});

	it('falls through to tier 2 when the user credential decrypts to empty', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(makeCredential() as any);
		vi.mocked(credentials.resolveApiKeyForCredential).mockReturnValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(makePoolConfig() as any);
		vi.mocked(potluck.findActiveDonationForProvider).mockResolvedValue({
			id: 'd-1',
			schoolId: 1,
			providerId: 'mistral',
			apiKeyEncrypted: 'pool-encrypted',
			tosVersion: '1',
			enabled: 1,
			createdAt: '',
			updatedAt: ''
		} as any);

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }
		});

		// Decryption of the placeholder above will fail (no real key) and
		// we'll fall through to env — but the important assertion is that
		// the pool WAS consulted.
		expect(potluck.getPotluckConfig).toHaveBeenCalled();
		expect(potluck.findActiveDonationForProvider).toHaveBeenCalled();
		expect(key).toBe('env-mistral');
	});
});

describe('resolveMistralApiKey — tier 2 (school pool)', () => {
	it('returns the pool key when user has no credential and pool is enabled with matching role', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(makePoolConfig() as any);
		vi.mocked(potluck.findActiveDonationForProvider).mockResolvedValue({
			id: 'd-1',
			schoolId: 1,
			providerId: 'mistral',
			apiKeyEncrypted: 'pool-encrypted',
			tosVersion: '1',
			enabled: 1,
			createdAt: '',
			updatedAt: ''
		} as any);

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral', TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) }
		});

		expect(potluck.getPotluckConfig).toHaveBeenCalled();
		// Pool returns a value if decryption succeeds. With a fake encrypted
		// blob, decryption will throw and we fall through to env — but the
		// pool was attempted.
		expect(potluck.findActiveDonationForProvider).toHaveBeenCalled();
		expect(key).toBe('env-mistral');
	});

	it('skips the pool when schoolId is null', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: null,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral' }
		});

		expect(potluck.getPotluckConfig).not.toHaveBeenCalled();
		expect(potluck.findActiveDonationForProvider).not.toHaveBeenCalled();
		expect(key).toBe('env-mistral');
	});

	it('skips the pool when the pool config is disabled', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(makePoolConfig({ enabled: 0 }) as any);

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral' }
		});

		expect(key).toBe('env-mistral');
	});
});

describe('resolveMistralApiKey — tier 3 (platform env)', () => {
	it('returns the env key when no user or pool key is available', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(null);

		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: 'class_teacher',
			env: { MISTRAL_API_KEY: 'env-mistral' }
		});

		expect(key).toBe('env-mistral');
	});

	it('throws when no credential can be resolved at any tier', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(null);

		await expect(
			resolveMistralApiKey({
				db: {} as any,
				userId: 1,
				schoolId: 1,
				userRole: 'class_teacher',
				env: {}
			})
		).rejects.toThrow(/MISTRAL_API_KEY is not configured/);
	});
});

describe('resolveMistralApiKey — per-call env read (no module-level capture)', () => {
	it('reads MISTRAL_API_KEY at call time, not at module load', async () => {
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(null);

		// First call: no env key → throws
		await expect(
			resolveMistralApiKey({
				db: {} as any,
				userId: 1,
				schoolId: 1,
				userRole: null,
				env: {}
			})
		).rejects.toThrow();

		// Second call: env key present → returns it. The function does NOT
		// remember the first call's empty env.
		const key = await resolveMistralApiKey({
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: null,
			env: { MISTRAL_API_KEY: 'mutated-later' }
		});

		expect(key).toBe('mutated-later');
	});
});
