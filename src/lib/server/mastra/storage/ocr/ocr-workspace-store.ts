/**
 * OCR Workspace Store — EdApex
 *
 * Replaces the legacy `OcrMemoryCache` (which persisted Mistral OCR results
 * in the assistant agent's working memory on a per-user thread) with a
 * workspace-backed store. The OCR markdown is written to
 * `extracted/${contentHash}.md` and a `.meta.json` sidecar holds the
 * lookup metadata.
 *
 * When the tenant carries an `examTypeId`, the cache is namespaced one
 * level deeper at `exams/examType-<examTypeId>/extracted/` so OCR results
 * stay aligned with the term they were generated for. Otherwise the
 * year-level `extracted/` path is used.
 */
import { createHash } from 'node:crypto';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';

export interface OcrMeta {
  contentHash: string;
  mistralFileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  pagesProcessed?: number;
  createdAt: string;
}

const EXTRACTED_DIR = 'extracted';

function rootDir(tenant: TenantContext): string {
  return tenant.examTypeId !== null
    ? `exams/examType-${tenant.examTypeId}/${EXTRACTED_DIR}`
    : EXTRACTED_DIR;
}

function metaPath(tenant: TenantContext, contentHash: string): string {
  return `${rootDir(tenant)}/${contentHash}.meta.json`;
}

function markdownPath(tenant: TenantContext, contentHash: string): string {
  return `${rootDir(tenant)}/${contentHash}.md`;
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
  contentHash: string,
): Promise<OcrMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(tenant, contentHash), { encoding: 'utf-8' });
    return JSON.parse(raw as string) as OcrMeta;
  } catch {
    return null;
  }
}

export class OcrWorkspaceStore {
  /**
   * Returns the OCR result for a file's content hash, invoking Mistral OCR
   * and persisting both the markdown and the meta sidecar on cache miss.
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

    if (await fs.exists(markdownPath(params.tenant, contentHash))) {
      const existing = await readMeta(fs, params.tenant, contentHash);
      if (existing) {
        const markdown = await readMarkdownViaFs(fs, params.tenant, contentHash);
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

    await fs.writeFile(markdownPath(params.tenant, contentHash), markdown, { recursive: true });
    await fs.writeFile(metaPath(params.tenant, contentHash), JSON.stringify(meta), { recursive: true });

    return { ...meta, markdown };
  }

  static async getByContentHash(params: {
    tenant: TenantContext;
    contentHash: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    return readMeta(fs, params.tenant, params.contentHash);
  }

  static async getByFileId(params: {
    tenant: TenantContext;
    mistralFileId: string;
  }): Promise<OcrMeta | null> {
    const fs = await resolveFilesystem(params.tenant);
    const dir = rootDir(params.tenant);
    let entries: Array<{ name: string }>;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.name.endsWith('.meta.json')) continue;
      try {
        const raw = await fs.readFile(`${dir}/${entry.name}`, { encoding: 'utf-8' });
        const meta = JSON.parse(raw as string) as OcrMeta;
        if (meta.mistralFileId === params.mistralFileId) return meta;
      } catch {
        // skip corrupt meta
      }
    }
    return null;
  }

  static async readMarkdown(params: {
    tenant: TenantContext;
    contentHash: string;
  }): Promise<string> {
    const fs = await resolveFilesystem(params.tenant);
    return readMarkdownViaFs(fs, params.tenant, params.contentHash);
  }
}

async function readMarkdownViaFs(
  fs: { readFile: (p: string, o?: { encoding?: BufferEncoding }) => Promise<string | Buffer> },
  tenant: TenantContext,
  contentHash: string,
): Promise<string> {
  const content = await fs.readFile(markdownPath(tenant, contentHash), { encoding: 'utf-8' });
  return typeof content === 'string' ? content : content.toString('utf-8');
}
