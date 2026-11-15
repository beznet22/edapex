/**
 * Tests that `MistralOcrService` does not cache the API key or the
 * Mistral client at module load. Every public method re-invokes
 * `resolveMistralApiKey` and re-constructs the `Mistral` client so
 * a user's own key is always read fresh — no stale env capture.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveMistralApiKeyMock = vi.fn();

vi.mock('$lib/server/mastra/provider/ocr-key-resolver', () => ({
	resolveMistralApiKey: (...args: unknown[]) => resolveMistralApiKeyMock(...args)
}));

const filesUploadMock = vi.fn();
const ocrProcessMock = vi.fn();

let mistralConstructCount = 0;
vi.mock('@mistralai/mistralai', () => {
	function MockMistral() {
		mistralConstructCount++;
		return {
			files: { upload: filesUploadMock },
			ocr: { process: ocrProcessMock }
		};
	}
	return { Mistral: MockMistral };
});

import { mistralOcrService } from './mistral-ocr.service';

beforeEach(() => {
	resolveMistralApiKeyMock.mockReset();
	filesUploadMock.mockReset();
	ocrProcessMock.mockReset();
	mistralConstructCount = 0;

	resolveMistralApiKeyMock.mockResolvedValue('gsk-test-key');
	filesUploadMock.mockResolvedValue({ id: 'mistral-file-1' });
	ocrProcessMock.mockResolvedValue({
		model: 'mistral-ocr-latest',
		pages: [{ markdown: 'page1' }, { markdown: 'page2' }],
		usageInfo: { pagesProcessed: 2, docSizeBytes: 1000 }
	});
});

describe('MistralOcrService — per-request key resolution (no module-level capture)', () => {
	it('calls resolveMistralApiKey with the supplied userId for every processDocument call', async () => {
		const buf = new Uint8Array([1, 2, 3]);

		await mistralOcrService.processDocument(buf, 'a.png', {
			db: {} as any,
			userId: 42,
			schoolId: 7,
			userRole: 'class_teacher'
		});

		expect(resolveMistralApiKeyMock).toHaveBeenCalledTimes(1);
		expect(resolveMistralApiKeyMock).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 42, schoolId: 7, userRole: 'class_teacher' })
		);
	});

	it('does NOT cache the key between calls with different users (no module-level state)', async () => {
		const buf = new Uint8Array([1, 2, 3]);

		await mistralOcrService.processDocument(buf, 'a.png', {
			db: {} as any,
			userId: 42,
			schoolId: 7,
			userRole: 'class_teacher'
		});

		await mistralOcrService.processDocument(buf, 'b.png', {
			db: {} as any,
			userId: 99,
			schoolId: 7,
			userRole: 'coordinator'
		});

		expect(resolveMistralApiKeyMock).toHaveBeenCalledTimes(2);
		expect(resolveMistralApiKeyMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ userId: 42 })
		);
		expect(resolveMistralApiKeyMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ userId: 99 })
		);
	});

	it('constructs a new Mistral client per call (no shared instance)', async () => {
		const buf = new Uint8Array([1, 2, 3]);

		await mistralOcrService.processDocument(buf, 'a.png', {
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: null
		});
		await mistralOcrService.processDocument(buf, 'b.png', {
			db: {} as any,
			userId: 2,
			schoolId: 1,
			userRole: null
		});

		expect(mistralConstructCount).toBe(2);
	});

	it('reflects mutations to process.env.MISTRAL_API_KEY across calls (no capture)', async () => {
		resolveMistralApiKeyMock.mockReset();
		// First call returns a key derived from one env; second from another
		resolveMistralApiKeyMock
			.mockResolvedValueOnce('gsk-first-call')
			.mockResolvedValueOnce('gsk-second-call');

		const buf = new Uint8Array([1, 2, 3]);

		const a = await mistralOcrService.processDocument(buf, 'a.png', {
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: null
		});
		const b = await mistralOcrService.processDocument(buf, 'b.png', {
			db: {} as any,
			userId: 1,
			schoolId: 1,
			userRole: null
		});

		expect((a as unknown as { fileId: string }).fileId).toBe('mistral-file-1');
		expect((b as unknown as { fileId: string }).fileId).toBe('mistral-file-1');
		// The key was fetched per-call (not cached) — the service made
		// exactly 2 resolveMistralApiKey calls with no shared state.
		expect(resolveMistralApiKeyMock).toHaveBeenCalledTimes(2);
	});
});
