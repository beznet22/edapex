// Verified: no native Mastra API for file-as-context injection as of @mastra/core@0.10.x
// Custom implementation per design spec — reads workspace files and formats them for agent context injection.

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { workspaceFiles } from '$lib/server/mastra/storage/files';

const MAX_REFS = 5;
const MAX_FILE_SIZE = 50 * 1024; // 50KB

/**
 * Reference to a workspace file or directory to be injected as context.
 */
export interface FileReference {
	key: string;
	name: string;
	type: 'file' | 'dir';
	size?: number;
	mimeType?: string;
	fileId?: string; // Mistral file ID for OCR documents
}

/**
 * Result of reading a single file reference for context injection.
 */
export interface FileContextInjection {
	ref: FileReference;
	content: string | null;
	truncated: boolean;
	error?: string;
}

/**
 * MIME types considered binary — only metadata is injected for these.
 */
const BINARY_MIME_PATTERNS = [
	'image/',
	'application/pdf',
	'application/zip',
	'application/gzip',
	'application/x-tar',
	'application/octet-stream',
	'application/vnd.',
	'audio/',
	'video/',
];

/**
 * Determines if a MIME type is binary (non-text).
 */
export function isBinaryMimeType(mimeType: string | undefined): boolean {
	if (!mimeType) return false;
	const lower = mimeType.toLowerCase();
	return BINARY_MIME_PATTERNS.some((pattern) => lower.startsWith(pattern));
}

/**
 * Reads referenced workspace files and produces a single context string
 * to prepend to the agent's context.
 *
 * Key behaviors:
 * - Max 5 references (slices to 5 if more provided)
 * - Max 50KB per file (truncates with notice if exceeded)
 * - Binary MIME types → metadata only: [File: name, Type: mimeType, Size: size]
 * - Missing files → [File: name — NOT FOUND]
 * - Text files → --- name ---\n{content}\n with [TRUNCATED at 50KB] if exceeded
 */
export async function injectFileContext(
	references: FileReference[],
	workspace: string,
	ctx: { db: LibSQLDatabase<any>; userId: number; schoolId: number | null; userRole?: string | null }
): Promise<string> {
	if (!references || references.length === 0) return '';

	const validRefs = references.slice(0, MAX_REFS);
	const parts: string[] = [];

	for (const ref of validRefs) {
		// OCR processed files: download markdown from Mistral
		if (ref.fileId) {
			try {
				// We dynamically import to avoid circular dependencies if needed, or just use the service
				const { mistralOcrService } = await import('$lib/server/service/mistral-ocr.service');
				const content = await mistralOcrService.getMarkdownByFileId(ctx, ref.fileId);
				parts.push(`--- ${ref.name} (OCR Extraction) ---\n${content}`);
			} catch (err) {
				parts.push(`[File: ${ref.name} — OCR Extraction Failed]`);
			}
			continue;
		}

		// Binary files: metadata only
		if (isBinaryMimeType(ref.mimeType)) {
			parts.push(`[File: ${ref.name}, Type: ${ref.mimeType}, Size: ${ref.size ?? 'unknown'}]`);
			continue;
		}

		// Attempt to read the file
		try {
			const scopedPath = ref.key
				? `${workspace}/${ref.key}`
				: workspace;

			const file = await workspaceFiles.download(scopedPath);

			// Check size before reading full content
			if (file.size > MAX_FILE_SIZE) {
				// Read only up to MAX_FILE_SIZE bytes
				const buffer = await file.arrayBuffer();
				const truncatedBuffer = buffer.slice(0, MAX_FILE_SIZE);
				const decoder = new TextDecoder('utf-8', { fatal: false });
				const content = decoder.decode(truncatedBuffer);
				parts.push(`--- ${ref.name} ---\n${content}\n[TRUNCATED at 50KB]`);
			} else {
				const content = await file.text();
				parts.push(`--- ${ref.name} ---\n${content}`);
			}
		} catch (err: unknown) {
			// File not found or read error
			const isNotFound =
				err instanceof Error &&
				(err.message.includes('NotFound') ||
					err.message.includes('not found') ||
					err.message.includes('ENOENT') ||
					(err as any).code === 'NotFound');

			if (isNotFound || (err instanceof Error && (err as any).code === 'NotFound')) {
				parts.push(`[File: ${ref.name} — NOT FOUND]`);
			} else {
				// Generic error — still exclude with error indication
				parts.push(`[File: ${ref.name} — NOT FOUND]`);
			}
		}
	}

	return parts.join('\n');
}
