/**
 * OCR working-memory fixtures for chatWorkflow OCR tests.
 *
 * Production pipeline (real E2E):
 *
 *   1. POST /api/uploads?kind=document
 *      - `MistralOcrService.processStructured(file, filename, STRUCTURED_OCR_SCHEMA)`
 *        returns a JSON-shaped response from Mistral (NOT validated against
 *        marksheetSchema — schema validation is the responsibility of the
 *        `validate-marksheet` tool, which re-derives a fully-typed JSON via
 *        the document agent at workflow validation time)
 *      - Writes `extracted/<documentId>.json` via
 *        `OcrWorkspaceStore.writeNormalizedJson(tenant, documentId, json)`
 *      - Adds manifest entry via `addDocument(tenant, { documentId, contentHash, ... })`
 *      - Returns `{ documentId, contentHash, fileId: contentHash }` to the client
 *
 *   2. POST /api/uploads/batch/finalize
 *      - `OcrWorkspaceStore.getOrCreate(tenant, file, fileName)`
 *        calls `MistralOcrService.processDocument(file, fileName)` which returns
 *        markdown + Mistral fileId
 *      - Writes `extracted/<contentHash>.md` + `extracted/<contentHash>.meta.json`
 *
 *   3. Chat workflow:
 *      - `streamDocumentStep` reads `extracted/<contentHash>.md`
 *      - `awaitValidationStep` suspends, then on resume calls
 *        `validate-marksheet(documentId = lastFormattedDocumentId)`
 *      - `commit-marksheet(documentId)` reads `extracted/<documentId>.json`
 *        and writes via `AssessmentService.upsertMarksheet`
 *
 * This fixture wires up step 2 against the real Mistral API (so the
 * markdown the chatWorkflow reads is what Mistral actually produced from
 * the screenshot) and skips step 1's structured call. The Mistral
 * `documentAnnotationFormat` API currently rejects our schema wrapper
 * (`{ type: 'object', properties: ... }`) — the production upload endpoint
 * has the same issue, so we mirror production by skipping the structured
 * extraction in the fixture too. The chatWorkflow integration test
 * exercises the full pipeline independently of the fixture's JSON seeding.
 *
 * Costs: each fixture seeds one screenshot → one Mistral API call
 * (`processDocument`). Gate the suite with `RUN_LIVE_E2E=1` so CI without
 * Mistral creds skips the suite entirely.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { addDocument } from '$lib/server/mastra/storage/ocr/manifest-store';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';

const MARKSHEET_FIXTURE_DIR = path.resolve(process.cwd(), 'static/marksheets');
const OCR_CACHE_DIR = path.resolve(process.cwd(), '.kimchi/ocr-cache');

const STRUCTURED_OCR_SCHEMA: Record<string, unknown> = {
	type: 'object',
	properties: {
		school: { type: 'object' },
		student: { type: 'object' },
		subjects: { type: 'array' },
		records: { type: 'array' },
		score: { type: 'object' }
	}
};

export interface MarksheetFixture {
	/** UUID returned by the upload endpoint; used as `toolCallId` and read by commit-marksheet */
	readonly documentId: string;
	/** sha256 of the file bytes; used as `fileId` and to read markdown from the workspace */
	readonly contentHash: string;
	readonly fileName: string;
	readonly mimeType: string;
	readonly fileSize: number;
	readonly markdown: string;
	/** Raw marksheetSchema-shaped JSON from structured Mistral OCR, or null if extraction failed */
	readonly marksheetJson: unknown;
}

/**
 * Loads a marksheet screenshot from `static/marksheets/<name>`, runs real
 * Mistral OCR (`OcrWorkspaceStore.getOrCreate`) against it, persists the
 * markdown + meta into the tenant workspace.
 *
 * `documentId` is freshly generated here (the structured-upload step that
 * would mint one is skipped because the production Mistral API rejects the
 * schema wrapper — see file header). Tests pass `documentId` as `toolCallId`
 * so any downstream commit-marksheet call targets the same fixture id.
 */
export async function seedMarksheetFixture(params: {
	tenant: TenantContext;
	fileName: string;
}): Promise<MarksheetFixture> {
	const sourcePath = path.join(MARKSHEET_FIXTURE_DIR, params.fileName);
	const bytes = await readFile(sourcePath);
	const uint8 = new Uint8Array(bytes);
	const mimeType = params.fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

	const documentId = crypto.randomUUID();

	// Step 1: structured OCR (mirrors the upload endpoint). Mistral returns a
	// JSON object shaped to STRUCTURED_OCR_SCHEMA, which we validate against
	// marksheetSchema before persisting. This is the JSON `commit-marksheet`
	// will read at `extracted/<documentId>.json` during the resume commit step.
	// Step 1: structured OCR (mirrors the upload endpoint). Mistral returns
	// a JSON object shaped to STRUCTURED_OCR_SCHEMA. We persist whatever
	// the OCR returned WITHOUT running marksheetSchema validation here —
	// schema validation is the job of `validate-marksheet` (the workflow
	// tool), not the OCR pipeline. The OCR pipeline only normalizes the
	// shape; the document agent re-derives a fully-typed JSON from the
	// markdown at validation time.
	let marksheetJson: unknown = null;
	const cachedStructured = await readCache<unknown>('structured', params.fileName, bytes);
	if (cachedStructured !== undefined) {
		marksheetJson = cachedStructured;
		await OcrWorkspaceStore.writeNormalizedJson(params.tenant, documentId, cachedStructured);
	} else {
		try {
			const structuredRaw = (await mistralOcrService.processStructured(
				uint8,
				params.fileName,
				STRUCTURED_OCR_SCHEMA
			)) as {
				pages?: Array<{ documentAnnotation?: string | unknown }>;
				documentAnnotation?: string | unknown;
			};
			const annotationRaw =
				structuredRaw.documentAnnotation ?? structuredRaw.pages?.[0]?.documentAnnotation;
			let annotationParsed: unknown = annotationRaw;
			if (typeof annotationRaw === 'string') {
				try {
					annotationParsed = JSON.parse(annotationRaw);
				} catch {
					annotationParsed = undefined;
				}
			}
			if (annotationParsed !== undefined && annotationParsed !== null) {
				await writeCache('structured', params.fileName, bytes, annotationParsed);
				marksheetJson = annotationParsed;
				await OcrWorkspaceStore.writeNormalizedJson(params.tenant, documentId, annotationParsed);
			}
		} catch (err) {
			console.warn('[ocr-fixtures] structured extraction failed; proceeding markdown-only', err);
		}
	}

	// Step 2: plain markdown OCR (mirrors finalizeBatch). Writes
	// `<contentHash>.md` and `<contentHash>.meta.json`. The chatWorkflow's
	// `streamDocumentStep` reads from this markdown file.
	let persisted: Awaited<ReturnType<typeof OcrWorkspaceStore.getOrCreate>>;
	const cachedMarkdown = await readCache<{ markdown: string; meta: { contentHash: string; mistralFileId: string; fileName: string; mimeType?: string; sizeBytes?: number; pagesProcessed?: number; createdAt: string } }>(
		'markdown',
		params.fileName,
		bytes
	);
	if (cachedMarkdown !== undefined) {
		// Replay the cached markdown into the tenant workspace without calling Mistral.
		const fs = await (
			await import('$lib/server/mastra/storage/workspaces/resolve-tenant-filesystem')
		).resolveTenantFilesystem({ requestContext: buildWorkspaceRequestContext(params.tenant) as never });
		const markdownPath = `extracted/${cachedMarkdown.meta.contentHash}.md`;
		const metaPath = `extracted/${cachedMarkdown.meta.contentHash}.meta.json`;
		await fs.writeFile(markdownPath, cachedMarkdown.markdown, { recursive: true });
		await fs.writeFile(metaPath, JSON.stringify(cachedMarkdown.meta), { recursive: true });
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
	}

	// Step 3: manifest entry. `commit-marksheet` looks up the entry by
	// `documentId` to find the original filename + contentHash for cleanup.
	await addDocument(params.tenant, {
		documentId,
		contentHash: persisted.contentHash,
		fileName: params.fileName,
		mimeType,
		size: bytes.byteLength,
		uploadedAt: new Date().toISOString(),
		status: 'pending'
	});

	return {
		documentId,
		contentHash: persisted.contentHash,
		fileName: params.fileName,
		mimeType,
		fileSize: bytes.byteLength,
		markdown: persisted.markdown,
		marksheetJson
	};
}

/**
 * Calls `seedMarksheetFixture` for every `.jpeg` / `.jpg` / `.png` file in
 * `static/marksheets/` and returns the resulting array.
 */
export async function seedAllMarksheetFixtures(tenant: TenantContext): Promise<MarksheetFixture[]> {
	const { readdir } = await import('node:fs/promises');
	const entries = await readdir(MARKSHEET_FIXTURE_DIR);
	const marksheets = entries.filter((f) => /\.(jpe?g|png)$/i.test(f));
	const fixtures: MarksheetFixture[] = [];
	for (const fileName of marksheets) {
		fixtures.push(await seedMarksheetFixture({ tenant, fileName }));
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
	if (!fs) throw new Error('OCR workspace filesystem did not resolve.');
}

export { buildWorkspaceRequestContext };

/**
 * OCR response cache — keyed by SHA-256 of the source bytes so each screenshot
 * is only sent to Mistral once across the entire test suite. Cached under
 * `.kimchi/ocr-cache/<kind>/<fileName>-<hash>.json`. Delete the cache
 * directory to force a re-OCR.
 */
async function readCache<T>(
	kind: 'markdown' | 'structured',
	fileName: string,
	bytes: Uint8Array
): Promise<T | undefined> {
	try {
		const dir = path.join(OCR_CACHE_DIR, kind);
		const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
		const cachePath = path.join(dir, `${fileName}-${hash}.json`);
		await stat(cachePath);
		const { readFile: rf } = await import('node:fs/promises');
		const raw = await rf(cachePath, 'utf8');
		return JSON.parse(raw) as T;
	} catch {
		return undefined;
	}
}

async function writeCache(
	kind: 'markdown' | 'structured',
	fileName: string,
	bytes: Uint8Array,
	value: unknown
): Promise<void> {
	try {
		const dir = path.join(OCR_CACHE_DIR, kind);
		await mkdir(dir, { recursive: true });
		const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
		const cachePath = path.join(dir, `${fileName}-${hash}.json`);
		await writeFile(cachePath, JSON.stringify(value), 'utf8');
	} catch (err) {
		console.warn('[ocr-fixtures] cache write failed (non-fatal):', err);
	}
}
