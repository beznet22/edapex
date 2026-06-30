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
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { ocrMarkdownPath, ocrMetaPath } from '$lib/server/mastra/storage/workspaces/paths';
import { addEntry } from '$lib/server/mastra/storage/workspaces/manifest-store';

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

async function readMeta(
  fs: { readFile: (p: string, o?: { encoding?: BufferEncoding }) => Promise<string | Buffer> },
  tenant: TenantContext,
  fileName: string,
): Promise<OcrMeta | null> {
  try {
    const raw = await fs.readFile(ocrMetaPath(fileName), { encoding: 'utf-8' });
    return JSON.parse(raw as string) as OcrMeta;
  } catch {
    return null;
  }
}

async function readMarkdownViaFs(
  fs: { readFile: (p: string, o?: { encoding?: BufferEncoding }) => Promise<string | Buffer> },
  fileName: string,
): Promise<string> {
  const content = await fs.readFile(ocrMarkdownPath(fileName), { encoding: 'utf-8' });
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
  }): Promise<OcrMeta & { markdown: string }> {
    const { bytes, sizeBytes } = await bytesFromFile(params.file);
    const contentHash = await sha256Hex(bytes);

    const fs = await resolveFilesystem(params.tenant);

    if (await fs.exists(ocrMarkdownPath(params.fileName))) {
      const existing = await readMeta(fs, params.tenant, params.fileName);
      if (existing) {
        const markdown = await readMarkdownViaFs(fs, params.fileName);
        return { ...existing, markdown };
      }
    }

    const ocrResponse = await mistralOcrService.processDocument(params.file, params.fileName);
    const pages = (ocrResponse.pages ?? []) as Array<{ markdown?: string }>;
    const markdown = pages.map((p) => p.markdown ?? '').join('\n\n').trim();

    const meta: OcrMeta = {
      contentHash,
      mistralFileId: (ocrResponse as { fileId?: string }).fileId ?? '',
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes,
      pagesProcessed: ocrResponse.usageInfo?.pagesProcessed,
      createdAt: new Date().toISOString(),
    };

    const mdPath = ocrMarkdownPath(params.fileName);
    const metaPath = ocrMetaPath(params.fileName);
    await fs.writeFile(mdPath, markdown, { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(meta), { recursive: true });
    await addEntry(params.tenant, {
      path: mdPath,
      kind: 'ocr-markdown',
      fileName: params.fileName,
      contentHash,
      uploadedAt: meta.createdAt,
      modifiedAt: meta.createdAt,
      mimeType: 'text/markdown'
    });
    await addEntry(params.tenant, {
      path: metaPath,
      kind: 'ocr-meta',
      fileName: params.fileName,
      contentHash,
      uploadedAt: meta.createdAt,
      modifiedAt: meta.createdAt,
      mimeType: 'application/json'
    });

    return { ...meta, markdown };
  }

  static async getByContentHash(params: {
    tenant: TenantContext;
    contentHash: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    // Search the canonical ocr/ directory for a meta with matching hash
    try {
      const entries = await fs.readdir('ocr');
      for (const entry of entries) {
        if (!entry.name.endsWith('.meta.json')) continue;
        const raw = await fs.readFile(`ocr/${entry.name}`, { encoding: 'utf-8' });
        const meta = JSON.parse(raw as string) as OcrMeta;
        if (meta.contentHash === params.contentHash) return meta;
      }
    } catch {
      return null;
    }
    return null;
  }

  static async getByFileId(params: {
    tenant: TenantContext;
    mistralFileId: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    try {
      const entries = await fs.readdir('ocr');
      for (const entry of entries) {
        if (!entry.name.endsWith('.meta.json')) continue;
        const raw = await fs.readFile(`ocr/${entry.name}`, { encoding: 'utf-8' });
        const meta = JSON.parse(raw as string) as OcrMeta;
        if (meta.mistralFileId === params.mistralFileId) return meta;
      }
    } catch {
      return null;
    }
    return null;
  }

  static async readMarkdown(params: {
    tenant: TenantContext;
    fileName: string;
  }): Promise<string> {
    const fs = await resolveFilesystem(params.tenant);
    return readMarkdownViaFs(fs, params.fileName);
  }
}
