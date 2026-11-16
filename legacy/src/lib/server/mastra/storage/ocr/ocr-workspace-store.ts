/**
 * OCR Workspace Store — EdApex
 *
 * Persists Mistral OCR results to the tenant workspace at canonical paths:
 *   `ocr/<fileName>.md` — OCR markdown output
 *   `ocr/<fileName>.meta.json` — Mistral file id, size, content hash sidecar
 *
 * The OCR JSON pipeline has been removed (Mistral structured output is
 * unreliable; the document agent re-derives JSON from the markdown via
 * marksheetSchema). Use `format-marksheet-document` to convert the OCR
 * markdown into a polished marksheet report.
 */
import { createHash } from 'node:crypto';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { ocrMarkdownPath, ocrMetaPath, uploadPath } from '$lib/server/workspace/paths';
import { addEntry, updateEntry, readManifest } from '$lib/server/workspace/manifest';

export interface OcrMeta {
  contentHash: string;
  mistralFileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  pagesProcessed?: number;
  createdAt: string;
}

async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const hasher = createHash('sha256');
  if (typeof input === 'string') {
    hasher.update(input, 'utf8');
  } else if (input instanceof Uint8Array) {
    hasher.update(input);
  } else {
    hasher.update(Buffer.from(input));
  }
  return hasher.digest('hex');
}

async function resolveFilesystem(tenant: TenantContext) {
  const rc = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
  if (!fs) throw new Error('Tenant workspace filesystem unavailable');
  return fs;
}

async function bytesFromFile(
  file: Blob | Buffer | Uint8Array,
): Promise<{ bytes: Uint8Array; sizeBytes: number }> {
  if (file instanceof Uint8Array) {
    return { bytes: file, sizeBytes: file.byteLength };
  }
  if (typeof Buffer !== 'undefined' && file instanceof Buffer) {
    return { bytes: new Uint8Array(file), sizeBytes: file.byteLength };
  }
  const buffer = await file.arrayBuffer();
  return { bytes: new Uint8Array(buffer), sizeBytes: buffer.byteLength };
}

/**
 * OCR lookup searches both the legacy root-level `ocr/` directory and the
 * exam-scoped `exams/examType-{id}/ocr/` directory. The new code writes to
 * the exam-scoped path, but we still need to find old data on disk after
 * upgrade. Returns the roots in priority order (exam-scoped first).
 */
function ocrSearchRoots(examTypeId: number | null | undefined): string[] {
  const roots: string[] = [];
  if (examTypeId != null) {
    roots.push(`exams/examType-${examTypeId}/ocr`);
  }
  roots.push('ocr');
  return roots;
}

async function readMeta(
  fs: { readFile: (p: string, o?: { encoding?: BufferEncoding }) => Promise<string | Buffer> },
  tenant: TenantContext,
  fileName: string,
): Promise<OcrMeta | null> {
  try {
    const raw = await fs.readFile(ocrMetaPath(fileName, tenant.examTypeId), { encoding: 'utf-8' });
    return JSON.parse(raw as string) as OcrMeta;
  } catch {
    return null;
  }
}

async function readMarkdownViaFs(
  fs: { readFile: (p: string, o?: { encoding?: BufferEncoding }) => Promise<string | Buffer> },
  fileName: string,
  examTypeId: number | null,
): Promise<string> {
  const content = await fs.readFile(ocrMarkdownPath(fileName, examTypeId), { encoding: 'utf-8' });
  return typeof content === 'string' ? content : content.toString('utf-8');
}

export class OcrWorkspaceStore {
  /**
   * Returns the OCR result for a file, invoking Mistral OCR and persisting
   * both the markdown and the meta sidecar on cache miss. Cache key is the
   * fileName (after sanitizeForFilename), not a content hash, so that
   * re-uploads with the same filename re-use the cached OCR.
   */
  static async getOrCreate(params: {
    tenant: TenantContext;
    file: Blob | Buffer | Uint8Array;
    fileName: string;
    mimeType?: string;
    db: import('drizzle-orm/libsql').LibSQLDatabase<any>;
    userId: number;
    /**
     * Optional pre-computed Mistral result. When provided, the method
     * skips its own Mistral call and persists the supplied data. Used by
     * the inline `?action=ocr-direct` endpoint which calls Mistral
     * directly to avoid the double-call.
     */
    precomputed?: { markdown: string; mistralFileId: string; pagesProcessed?: number };
  }): Promise<OcrMeta & { markdown: string }> {
    const { bytes, sizeBytes } = await bytesFromFile(params.file);
    const contentHash = await sha256Hex(bytes);

    const fs = await resolveFilesystem(params.tenant);
    if (params.tenant.examTypeId == null) {
      throw new Error('TENANT_EXAM_TYPE_REQUIRED: OCR writes require an active examTypeId');
    }
    const examTypeId = params.tenant.examTypeId;

    if (await fs.exists(ocrMarkdownPath(params.fileName, examTypeId))) {
      const existing = await readMeta(fs, params.tenant, params.fileName);
      if (existing) {
        const mdPath = ocrMarkdownPath(params.fileName, examTypeId);
        const localMetaPath = ocrMetaPath(params.fileName, examTypeId);
        const manifest = await readManifest(params.tenant, examTypeId);
        if (!manifest.entries[mdPath]) {
          await addEntry(params.tenant, {
            path: mdPath,
            kind: 'ocr-markdown',
            fileName: params.fileName,
            contentHash: existing.contentHash,
            examTypeId,
            uploadedAt: existing.createdAt,
            modifiedAt: existing.createdAt,
            mimeType: 'text/markdown'
          }, examTypeId);
        }
        if (!manifest.entries[localMetaPath]) {
          await addEntry(params.tenant, {
            path: localMetaPath,
            kind: 'ocr-meta',
            fileName: params.fileName,
            contentHash: existing.contentHash,
            examTypeId,
            uploadedAt: existing.createdAt,
            modifiedAt: existing.createdAt,
            mimeType: 'application/json'
          }, examTypeId);
        }
        const sourcePath = uploadPath(params.fileName, examTypeId);
        const sourceEntry = manifest.entries[sourcePath];
        if (sourceEntry && sourceEntry.status !== 'Extracted') {
          await updateEntry(params.tenant, sourcePath, { status: 'Extracted' }, examTypeId);
        }
        const markdown = await readMarkdownViaFs(fs, params.fileName, examTypeId);
        return { ...existing, markdown };
      }
    }

    let markdown: string;
    let mistralFileId: string;
    let pagesProcessed: number | undefined;
    if (params.precomputed) {
      markdown = params.precomputed.markdown;
      mistralFileId = params.precomputed.mistralFileId;
      pagesProcessed = params.precomputed.pagesProcessed;
    } else {
      const ocrResponse = await mistralOcrService.processDocument(params.file, params.fileName, {
        db: params.db,
        userId: params.userId,
        schoolId: params.tenant.schoolId,
        userRole: null
      });
      const pages = (ocrResponse.pages ?? []) as Array<{ markdown?: string }>;
      markdown = pages.map((p) => p.markdown ?? '').join('\n\n').trim();
      mistralFileId = (ocrResponse as { fileId?: string }).fileId ?? '';
      pagesProcessed = ocrResponse.usageInfo?.pagesProcessed;
    }

    const meta: OcrMeta = {
      contentHash,
      mistralFileId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes,
      pagesProcessed,
      createdAt: new Date().toISOString(),
    };

    const mdPath = ocrMarkdownPath(params.fileName, examTypeId);
    const metaPath = ocrMetaPath(params.fileName, examTypeId);
    await fs.writeFile(mdPath, markdown, { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(meta), { recursive: true });
    await addEntry(
      params.tenant,
      {
        path: mdPath,
        kind: 'ocr-markdown',
        fileName: params.fileName,
        contentHash,
        examTypeId,
        uploadedAt: meta.createdAt,
        modifiedAt: meta.createdAt,
        mimeType: 'text/markdown'
      },
      examTypeId
    );
    await addEntry(
      params.tenant,
      {
        path: metaPath,
        kind: 'ocr-meta',
        fileName: params.fileName,
        contentHash,
        examTypeId,
        uploadedAt: meta.createdAt,
        modifiedAt: meta.createdAt,
        mimeType: 'application/json'
      },
      examTypeId
    );

    const sourcePath = uploadPath(params.fileName, examTypeId);
    await updateEntry(params.tenant, sourcePath, { status: 'Extracted' }, examTypeId);

    return { ...meta, markdown };
  }

  static async getByContentHash(params: {
    tenant: TenantContext;
    contentHash: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    // Search both the legacy root-level ocr/ and the exam-scoped
    // exams/examType-{id}/ocr/ for a meta with matching hash.
    const searchRoots = ocrSearchRoots(params.tenant.examTypeId);
    for (const root of searchRoots) {
      try {
        const entries = await fs.readdir(root);
        for (const entry of entries) {
          if (!entry.name.endsWith('.meta.json')) continue;
          const raw = await fs.readFile(`${root}/${entry.name}`, { encoding: 'utf-8' });
          const meta = JSON.parse(raw as string) as OcrMeta;
          if (meta.contentHash === params.contentHash) return meta;
        }
      } catch {
        // try next root
      }
    }
    return null;
  }

  static async getByFileId(params: {
    tenant: TenantContext;
    mistralFileId: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    const searchRoots = ocrSearchRoots(params.tenant.examTypeId);
    for (const root of searchRoots) {
      try {
        const entries = await fs.readdir(root);
        for (const entry of entries) {
          if (!entry.name.endsWith('.meta.json')) continue;
          const raw = await fs.readFile(`${root}/${entry.name}`, { encoding: 'utf-8' });
          const meta = JSON.parse(raw as string) as OcrMeta;
          if (meta.mistralFileId === params.mistralFileId) return meta;
        }
      } catch {
        // try next root
      }
    }
    return null;
  }

  static async readMarkdown(params: {
    tenant: TenantContext;
    fileName: string;
  }): Promise<string> {
    const fs = await resolveFilesystem(params.tenant);
    return readMarkdownViaFs(fs, params.fileName, params.tenant.examTypeId);
  }
}
