/**
 * OCR working-memory fixtures for chatWorkflow OCR tests.
 *
 * Production pipeline (real E2E):
 *
 *   1. POST /api/uploads?kind=document
 *      - Persists raw screenshot + mime type to disk; mints a documentId
 *      - Registers upload in single workspace manifest.json with 
 *      - Returns `{ documentId, contentHash, fileId: contentHash }`
 *
 *   2. POST /api/uploads/batch/finalize
 *      - `OcrWorkspaceStore.getOrCreate(tenant, file, fileName)`
 *        calls `MistralOcrService.processDocument(file, fileName)` which returns
 *        markdown + Mistral fileId
 *      - Writes `ocr/<fileName>.md` + `ocr/<fileName>.meta.json`
 *
 *   3. Chat workflow:
 *      - `streamDocumentStep` reads `ocr/<fileName>.md`
 *      - `format-marksheet-document` re-formats into `marksheets/<studentId>-<name>.md`
 *      - `awaitValidationStep` suspends; on resume, calls
 *        `validate-marksheet(studentId, correctedMarkdown)`
 *        which re-derives JSON from markdown via document agent and writes
 *        `marksheets/<studentId>.json`
 *      - `commit-marksheet(studentId)` reads `marksheets/<studentId>.json`
 *        and writes via `AssessmentService.upsertMarksheet`
 *
 * The OCR JSON pipeline has been dropped. Mistral structured output was
 * unreliable; the document agent re-derives JSON from markdown at
 * validation time.
 *
 * Costs: each fixture seeds one screenshot → one Mistral API call
 * (`processDocument`). Gate the suite with `RUN_LIVE_E2E=1` so CI without
 * Mistral creds skips the suite entirely.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { addEntry as addWorkspaceEntry } from '$lib/server/workspace/manifest';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import {
	ocrMarkdownPath,
	ocrMetaPath
} from '$lib/server/workspace/paths';

const MARKSHEET_FIXTURE_DIR = path.resolve(process.cwd(), 'static/marksheets');
const OCR_CACHE_DIR = path.resolve(process.cwd(), '.kimchi/ocr-cache');

export interface MarksheetFixture {
	/** UUID returned by the upload endpoint; used as `toolCallId` and for manifest lookup */
	readonly documentId: string;
	/** sha256 of the file bytes; recorded in OCR meta sidecar */
	readonly contentHash: string;
	readonly fileName: string;
	readonly mimeType: string;
	readonly fileSize: number;
	readonly markdown: string;
}

/**
 * Loads a marksheet screenshot from `static/marksheets/<name>`, runs real
 * Mistral OCR (`OcrWorkspaceStore.getOrCreate`) against it, persists the
 * markdown + meta into the tenant workspace at canonical `ocr/` paths.
 */
export async function seedMarksheetFixture(params: {
	tenant: TenantContext;
	fileName: string;
	/** Defaults to `'LB2B'` per the test scope. Pass '' for the root. */
	subdir?: string;
}): Promise<MarksheetFixture> {
	const sourcePath = path.join(MARKSHEET_FIXTURE_DIR, params.subdir ?? 'LB2B', params.fileName);
	const bytes = await readFile(sourcePath);
	const uint8 = new Uint8Array(bytes);
	const mimeType = params.fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

	const documentId = crypto.randomUUID();

	// Step 1: plain markdown OCR (mirrors finalizeBatch). Writes
	// `ocr/<fileName>.md` and `ocr/<fileName>.meta.json`. The chatWorkflow's
	// `streamDocumentStep` reads from this markdown file.
	let persisted: Awaited<ReturnType<typeof OcrWorkspaceStore.getOrCreate>>;
	const cachedMarkdown = await readCache<{
		markdown: string;
		meta: {
			contentHash: string;
			mistralFileId: string;
			fileName: string;
			mimeType?: string;
			sizeBytes?: number;
			pagesProcessed?: number;
			createdAt: string;
		};
	}>('markdown', params.fileName, bytes);

	if (cachedMarkdown !== undefined) {
		// Replay the cached markdown into the tenant workspace without calling Mistral.
		const fs = await (
			await import('$lib/server/workspace/resolve-filesystem')
		).resolveTenantFilesystem({
			requestContext: buildWorkspaceRequestContext(params.tenant) as never
		});
		if (!fs) throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem not configured');
		const mdPath = ocrMarkdownPath(params.fileName);
		const metaPath = ocrMetaPath(params.fileName);
		await fs.writeFile(mdPath, cachedMarkdown.markdown, { recursive: true });
		await fs.writeFile(metaPath, JSON.stringify(cachedMarkdown.meta), { recursive: true });
		// Always copy the original image into uploads/ so @file mention and
		// re-extraction flows can find the source bytes. Register in
		// single manifest.json (kind: user-file).
		const uploadRel = `uploads/${params.fileName}`;
		await fs.writeFile(uploadRel, uint8, { recursive: true });
		await addWorkspaceEntry(params.tenant, {
			path: uploadRel,
			kind: 'user-file',
			fileName: params.fileName,
			contentHash: cachedMarkdown.meta.contentHash,
			uploadedAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			mimeType,
			sizeBytes: bytes.byteLength
		}, params.tenant.examTypeId ?? 0);
		// Mirror the live OcrWorkspaceStore behavior — register OCR entries
		// in the single manifest.json so they're discoverable.
		await addWorkspaceEntry(params.tenant, {
			path: mdPath,
			kind: 'ocr-markdown',
			fileName: params.fileName,
			contentHash: cachedMarkdown.meta.contentHash,
			uploadedAt: cachedMarkdown.meta.createdAt,
			modifiedAt: cachedMarkdown.meta.createdAt,
			mimeType: 'text/markdown'
		}, params.tenant.examTypeId ?? 0);
		await addWorkspaceEntry(params.tenant, {
			path: metaPath,
			kind: 'ocr-meta',
			fileName: params.fileName,
			contentHash: cachedMarkdown.meta.contentHash,
			uploadedAt: cachedMarkdown.meta.createdAt,
			modifiedAt: cachedMarkdown.meta.createdAt,
			mimeType: 'application/json'
		}, params.tenant.examTypeId ?? 0);
		persisted = { ...cachedMarkdown.meta, markdown: cachedMarkdown.markdown };
	} else {
		persisted = await OcrWorkspaceStore.getOrCreate({
			tenant: params.tenant,
			file: new Blob([uint8], { type: mimeType }),
			fileName: params.fileName,
			mimeType
		});
		await writeCache('markdown', params.fileName, bytes, {
			markdown: persisted.markdown,
			meta: {
				contentHash: persisted.contentHash,
				mistralFileId: persisted.mistralFileId,
				fileName: persisted.fileName,
				mimeType: persisted.mimeType,
				sizeBytes: persisted.sizeBytes,
				pagesProcessed: persisted.pagesProcessed,
				createdAt: persisted.createdAt
			}
		});
		// Copy the original image into uploads/ so @file mention and
		// re-extraction flows can find the source bytes. Register in
		// single manifest.json (kind: user-file).
		const liveFs = await (
			await import('$lib/server/workspace/resolve-filesystem')
		).resolveTenantFilesystem({
			requestContext: buildWorkspaceRequestContext(params.tenant) as never
		});
		if (liveFs) {
			const uploadRel = `uploads/${params.fileName}`;
			await liveFs.writeFile(uploadRel, uint8, { recursive: true });
			await addWorkspaceEntry(params.tenant, {
				path: uploadRel,
				kind: 'user-file',
				fileName: params.fileName,
				contentHash: persisted.contentHash,
				uploadedAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				mimeType,
				sizeBytes: bytes.byteLength
			}, params.tenant.examTypeId ?? 0);
		}
	}

	// Step 2: register the upload in the single workspace manifest.json.
	// `format-marksheet-document` and `link-marksheet-student` look up by
	// `documentId` (the UUID we minted above). The legacy
	// `extracted/manifest.json` is gone — everything lives here.
	await addWorkspaceEntry(params.tenant, {
		path: `uploads/${params.fileName}`,
		kind: 'user-file',
		documentId,
		fileName: params.fileName,
		contentHash: persisted.contentHash,
		uploadedAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
		mimeType,
		sizeBytes: bytes.byteLength
	}, params.tenant.examTypeId ?? 0);

	return {
		documentId,
		contentHash: persisted.contentHash,
		fileName: params.fileName,
		mimeType,
		fileSize: bytes.byteLength,
		markdown: persisted.markdown
	};
}

/**
 * Calls `seedMarksheetFixture` for every `.jpeg` / `.jpg` / `.png` file in
 * `static/marksheets/` and returns the resulting array.
 */
export async function seedAllMarksheetFixtures(
	tenant: TenantContext,
	subdir: string = 'LB2B'
): Promise<MarksheetFixture[]> {
	const { readdir } = await import('node:fs/promises');
	const targetDir = path.join(MARKSHEET_FIXTURE_DIR, subdir);
	const entries = await readdir(targetDir).catch(() => []);
	const marksheets = entries.filter((f) => /\.(jpe?g|png)$/i.test(f));
	const fixtures: MarksheetFixture[] = [];
	for (const fileName of marksheets) {
		fixtures.push(await seedMarksheetFixture({ tenant, fileName, subdir }));
	}
	return fixtures;
}

/**
 * Asserts the OCR workspace filesystem resolver succeeds for the given tenant.
 * Used in test setup to fail fast when the workspace sandbox is misconfigured.
 */
export async function assertWorkspaceResolves(tenant: TenantContext): Promise<void> {
	const rc = buildWorkspaceRequestContext(tenant);
	const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
	if (!fs) throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem not configured');
}

async function readCache<T>(kind: 'markdown' | 'structured', fileName: string, bytes: Uint8Array): Promise<T | undefined> {
	const cachePath = path.join(OCR_CACHE_DIR, kind, `${contentHashKey(bytes)}.json`);
	try {
		const raw = await readFile(cachePath, 'utf-8');
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

async function writeCache(
	kind: 'markdown' | 'structured',
	fileName: string,
	bytes: Uint8Array,
	data: unknown
): Promise<void> {
	const cacheDir = path.join(OCR_CACHE_DIR, kind);
	await mkdir(cacheDir, { recursive: true });
	const cachePath = path.join(cacheDir, `${contentHashKey(bytes)}.json`);
	await writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
}

function contentHashKey(bytes: Uint8Array): string {
	const { createHash } = require('node:crypto') as typeof import('node:crypto');
	return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

export { MARKSHEET_FIXTURE_DIR, OCR_CACHE_DIR };
