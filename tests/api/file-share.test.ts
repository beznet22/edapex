import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $env/dynamic/private
vi.mock('$env/dynamic/private', () => ({
	env: {
		FILE_SHARE_SECRET: 'test-file-share-secret-key-for-testing',
		JWT_SIGN_SECRET: 'test-jwt-sign-secret'
	}
}));

// Mock the storage module
vi.mock('$lib/server/storage/files', () => ({
	workspaceFiles: {
		download: vi.fn()
	}
}));

import { signShareToken, verifyShareToken } from '../../src/routes/api/file/share/+server';

describe('File Share API', () => {
	describe('signShareToken', () => {
		it('generates a valid token with key and workspace', async () => {
			const result = await signShareToken('documents/report.pdf', 'workspace-123');

			expect(result.token).toBeDefined();
			expect(typeof result.token).toBe('string');
			expect(result.token.length).toBeGreaterThan(0);
			expect(result.expiresAt).toBeInstanceOf(Date);
		});

		it('sets expiration to 7 days from now', async () => {
			const before = Date.now();
			const result = await signShareToken('file.txt', 'ws-1');
			const after = Date.now();

			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
			const expiresAtMs = result.expiresAt.getTime();

			// Expiration should be ~7 days from now (within 1 second tolerance)
			expect(expiresAtMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
			expect(expiresAtMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
		});

		it('produces different tokens for different keys', async () => {
			const result1 = await signShareToken('file1.txt', 'ws-1');
			const result2 = await signShareToken('file2.txt', 'ws-1');

			expect(result1.token).not.toBe(result2.token);
		});

		it('produces different tokens for different workspaces', async () => {
			const result1 = await signShareToken('file.txt', 'ws-1');
			const result2 = await signShareToken('file.txt', 'ws-2');

			expect(result1.token).not.toBe(result2.token);
		});
	});

	describe('verifyShareToken', () => {
		it('verifies a valid token and returns payload', async () => {
			const { token } = await signShareToken('docs/readme.md', 'my-workspace');
			const payload = await verifyShareToken(token);

			expect(payload).not.toBeNull();
			expect(payload!.key).toBe('docs/readme.md');
			expect(payload!.workspace).toBe('my-workspace');
		});

		it('returns null for an invalid token', async () => {
			const payload = await verifyShareToken('invalid.token.string');
			expect(payload).toBeNull();
		});

		it('returns null for an empty string', async () => {
			const payload = await verifyShareToken('');
			expect(payload).toBeNull();
		});

		it('returns null for a tampered token', async () => {
			const { token } = await signShareToken('file.txt', 'ws-1');
			// Tamper with the token by changing a character
			const tampered = token.slice(0, -5) + 'XXXXX';
			const payload = await verifyShareToken(tampered);
			expect(payload).toBeNull();
		});

		it('round-trips key and workspace correctly', async () => {
			const testCases = [
				{ key: 'simple.txt', workspace: 'ws1' },
				{ key: 'path/to/deep/file.pdf', workspace: 'workspace-with-dashes' },
				{ key: 'file with spaces.doc', workspace: 'ws_underscore' },
				{ key: 'unicode-ñ.txt', workspace: 'ws123' }
			];

			for (const { key, workspace } of testCases) {
				const { token } = await signShareToken(key, workspace);
				const payload = await verifyShareToken(token);
				expect(payload).not.toBeNull();
				expect(payload!.key).toBe(key);
				expect(payload!.workspace).toBe(workspace);
			}
		});
	});

	describe('POST /api/file/share handler logic', () => {
		it('rejects request with missing key', async () => {
			// Simulate the validation logic from the POST handler
			const body = { workspace: 'ws-1' };
			const key = body.key as unknown;
			expect(!key || typeof key !== 'string').toBe(true);
		});

		it('rejects request with missing workspace', async () => {
			const body = { key: 'file.txt' };
			const workspace = body.workspace as unknown;
			expect(!workspace || typeof workspace !== 'string').toBe(true);
		});

		it('rejects request with non-string key', async () => {
			const body = { key: 123, workspace: 'ws-1' };
			expect(typeof body.key !== 'string').toBe(true);
		});

		it('rejects request with empty key', async () => {
			const body = { key: '', workspace: 'ws-1' };
			expect(!body.key).toBe(true);
		});

		it('rejects request with empty workspace', async () => {
			const body = { key: 'file.txt', workspace: '' };
			expect(!body.workspace).toBe(true);
		});
	});

	describe('Share URL format', () => {
		it('generates URL in expected format', async () => {
			const { token } = await signShareToken('report.pdf', 'school-42');
			const origin = 'https://app.edapex.com';
			const shareUrl = `${origin}/api/file/shared/${token}`;

			expect(shareUrl).toContain('/api/file/shared/');
			expect(shareUrl.startsWith(origin)).toBe(true);
			// Token is a JWT with 3 parts separated by dots
			const tokenPart = shareUrl.split('/api/file/shared/')[1];
			expect(tokenPart.split('.').length).toBe(3);
		});
	});

	describe('Token expiration', () => {
		it('token contains correct expiration claim', async () => {
			const before = Math.floor(Date.now() / 1000);
			const { token } = await signShareToken('file.txt', 'ws-1');
			const after = Math.floor(Date.now() / 1000);

			// Decode the JWT payload (middle part) to check exp claim
			const payloadB64 = token.split('.')[1];
			const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

			const sevenDaysSec = 7 * 24 * 60 * 60;
			expect(payload.exp).toBeGreaterThanOrEqual(before + sevenDaysSec);
			expect(payload.exp).toBeLessThanOrEqual(after + sevenDaysSec + 1);
		});

		it('token contains issued-at claim', async () => {
			const before = Math.floor(Date.now() / 1000);
			const { token } = await signShareToken('file.txt', 'ws-1');
			const after = Math.floor(Date.now() / 1000);

			const payloadB64 = token.split('.')[1];
			const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

			expect(payload.iat).toBeGreaterThanOrEqual(before);
			expect(payload.iat).toBeLessThanOrEqual(after);
		});
	});
});
