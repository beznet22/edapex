import { describe, it, expect, vi, beforeEach } from 'vitest';
import { injectFileContext, isBinaryMimeType, type FileReference } from '$lib/server/mastra/file-context';

// Mock the storage module
vi.mock('$lib/server/mastra/storage/files', () => ({
	workspaceFiles: {
		download: vi.fn()
	}
}));

import { workspaceFiles } from '$lib/server/mastra/storage/files';

const mockDownload = vi.mocked(workspaceFiles.download);

function createMockStoredFile(content: string, opts: { type?: string; size?: number } = {}) {
	const encoder = new TextEncoder();
	const buffer = encoder.encode(content);
	return {
		name: 'test-file',
		size: opts.size ?? buffer.byteLength,
		type: opts.type ?? 'text/plain',
		text: vi.fn().mockResolvedValue(content),
		arrayBuffer: vi.fn().mockResolvedValue(buffer.buffer),
		stream: vi.fn(),
		blob: vi.fn(),
		key: 'test-key',
	};
}

describe('isBinaryMimeType', () => {
	it('returns true for image types', () => {
		expect(isBinaryMimeType('image/png')).toBe(true);
		expect(isBinaryMimeType('image/jpeg')).toBe(true);
		expect(isBinaryMimeType('image/svg+xml')).toBe(true);
	});

	it('returns true for application/pdf', () => {
		expect(isBinaryMimeType('application/pdf')).toBe(true);
	});

	it('returns true for application/zip', () => {
		expect(isBinaryMimeType('application/zip')).toBe(true);
	});

	it('returns true for audio and video types', () => {
		expect(isBinaryMimeType('audio/mpeg')).toBe(true);
		expect(isBinaryMimeType('video/mp4')).toBe(true);
	});

	it('returns true for application/vnd.* types', () => {
		expect(isBinaryMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
	});

	it('returns false for text types', () => {
		expect(isBinaryMimeType('text/plain')).toBe(false);
		expect(isBinaryMimeType('text/html')).toBe(false);
		expect(isBinaryMimeType('text/csv')).toBe(false);
	});

	it('returns false for application/json', () => {
		expect(isBinaryMimeType('application/json')).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isBinaryMimeType(undefined)).toBe(false);
	});

	it('is case-insensitive', () => {
		expect(isBinaryMimeType('Image/PNG')).toBe(true);
		expect(isBinaryMimeType('APPLICATION/PDF')).toBe(true);
	});
});

describe('injectFileContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty string for empty references', async () => {
		const result = await injectFileContext([], 'workspace1');
		expect(result).toBe('');
	});

	it('returns empty string for null/undefined references', async () => {
		const result = await injectFileContext(null as any, 'workspace1');
		expect(result).toBe('');
	});

	it('reads text file and formats with header', async () => {
		const mockFile = createMockStoredFile('Hello, world!');
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'docs/readme.md', name: 'readme.md', type: 'file', mimeType: 'text/markdown' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('--- readme.md ---\nHello, world!');
		expect(mockDownload).toHaveBeenCalledWith('workspace1/docs/readme.md');
	});

	it('injects metadata only for binary files', async () => {
		const refs: FileReference[] = [
			{ key: 'images/photo.png', name: 'photo.png', type: 'file', size: 1024, mimeType: 'image/png' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('[File: photo.png, Type: image/png, Size: 1024]');
		expect(mockDownload).not.toHaveBeenCalled();
	});

	it('injects metadata only for PDF files', async () => {
		const refs: FileReference[] = [
			{ key: 'docs/report.pdf', name: 'report.pdf', type: 'file', size: 50000, mimeType: 'application/pdf' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('[File: report.pdf, Type: application/pdf, Size: 50000]');
	});

	it('shows "unknown" size for binary files without size', async () => {
		const refs: FileReference[] = [
			{ key: 'images/photo.png', name: 'photo.png', type: 'file', mimeType: 'image/png' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('[File: photo.png, Type: image/png, Size: unknown]');
	});

	it('handles missing files with NOT FOUND indication', async () => {
		const notFoundError = new Error('NotFound: file does not exist');
		(notFoundError as any).code = 'NotFound';
		mockDownload.mockRejectedValue(notFoundError);

		const refs: FileReference[] = [
			{ key: 'missing/file.txt', name: 'file.txt', type: 'file', mimeType: 'text/plain' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('[File: file.txt — NOT FOUND]');
	});

	it('handles generic errors as NOT FOUND', async () => {
		mockDownload.mockRejectedValue(new Error('Some unexpected error'));

		const refs: FileReference[] = [
			{ key: 'broken/file.txt', name: 'file.txt', type: 'file', mimeType: 'text/plain' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('[File: file.txt — NOT FOUND]');
	});

	it('truncates text files exceeding 50KB with notice', async () => {
		const largeContent = 'A'.repeat(60 * 1024); // 60KB
		const encoder = new TextEncoder();
		const fullBuffer = encoder.encode(largeContent);

		const mockFile = {
			name: 'large-file.txt',
			size: fullBuffer.byteLength,
			type: 'text/plain',
			text: vi.fn().mockResolvedValue(largeContent),
			arrayBuffer: vi.fn().mockResolvedValue(fullBuffer.buffer),
			stream: vi.fn(),
			blob: vi.fn(),
			key: 'large-file.txt',
		};
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'large-file.txt', name: 'large-file.txt', type: 'file', mimeType: 'text/plain' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toContain('--- large-file.txt ---\n');
		expect(result).toContain('[TRUNCATED at 50KB]');
		// Content should be truncated to 50KB
		const contentPart = result.replace('--- large-file.txt ---\n', '').replace('\n[TRUNCATED at 50KB]', '');
		expect(contentPart.length).toBeLessThanOrEqual(50 * 1024);
	});

	it('does not truncate files at exactly 50KB', async () => {
		const exactContent = 'B'.repeat(50 * 1024); // exactly 50KB
		const mockFile = createMockStoredFile(exactContent, { size: 50 * 1024 });
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'exact.txt', name: 'exact.txt', type: 'file', mimeType: 'text/plain' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).not.toContain('[TRUNCATED at 50KB]');
		expect(result).toBe(`--- exact.txt ---\n${exactContent}`);
	});

	it('limits to max 5 references', async () => {
		const mockFile = createMockStoredFile('content');
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = Array.from({ length: 8 }, (_, i) => ({
			key: `file${i}.txt`,
			name: `file${i}.txt`,
			type: 'file' as const,
			mimeType: 'text/plain'
		}));

		await injectFileContext(refs, 'workspace1');
		// Should only download 5 files
		expect(mockDownload).toHaveBeenCalledTimes(5);
	});

	it('handles multiple references with mixed types', async () => {
		const mockFile = createMockStoredFile('text content');
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'doc.txt', name: 'doc.txt', type: 'file', mimeType: 'text/plain' },
			{ key: 'photo.jpg', name: 'photo.jpg', type: 'file', size: 2048, mimeType: 'image/jpeg' },
			{ key: 'data.csv', name: 'data.csv', type: 'file', mimeType: 'text/csv' },
		];

		const result = await injectFileContext(refs, 'workspace1');
		const lines = result.split('\n');

		// First file: text content
		expect(result).toContain('--- doc.txt ---\ntext content');
		// Second file: binary metadata
		expect(result).toContain('[File: photo.jpg, Type: image/jpeg, Size: 2048]');
		// Third file: text content
		expect(result).toContain('--- data.csv ---\ntext content');
	});

	it('handles files without mimeType as text', async () => {
		const mockFile = createMockStoredFile('no mime content');
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'unknown.dat', name: 'unknown.dat', type: 'file' }
		];

		const result = await injectFileContext(refs, 'workspace1');
		expect(result).toBe('--- unknown.dat ---\nno mime content');
	});

	it('constructs correct scoped path from workspace and key', async () => {
		const mockFile = createMockStoredFile('content');
		mockDownload.mockResolvedValue(mockFile as any);

		const refs: FileReference[] = [
			{ key: 'subfolder/nested/file.md', name: 'file.md', type: 'file', mimeType: 'text/markdown' }
		];

		await injectFileContext(refs, 'school_1');
		expect(mockDownload).toHaveBeenCalledWith('school_1/subfolder/nested/file.md');
	});
});
