/**
 * OCR Working-Memory → Workspace Migration Sweep
 *
 * One-time migration that reads every legacy `user-ocr-${userId}` thread's
 * working memory and writes the cached OCR markdown + sidecar to the
 * corresponding tenant workspace's `extracted/` directory.
 *
 * Run with: `pnpx tsx scripts/migration/ocr-memory-to-workspace.ts`
 *
 * Idempotency: writes are skipped when `${contentHash}.md` already exists
 * in the target workspace. The legacy thread is dropped only after a
 * successful write, so re-running the script picks up any partial work.
 *
 * Failure mode: if the workspace write fails, the thread is left intact
 * for the next run. No data is destroyed until it has a new home.
 */
import 'dotenv/config';
import { LibSQLStore } from '@mastra/libsql';
import { mastra } from '../../src/lib/server/mastra';
import { LocalFilesystem } from '@mastra/core/workspace';
import { createTenantContext, type TenantContext } from '../../src/lib/server/mastra/tenant-context';
import { ensureStorageInitialized } from '../../src/lib/server/mastra/storage';

const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';
const DB_NAME = process.env.MYSQL_DATABASE ?? 'edapex';
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? `${process.cwd()}/.workspaces`;
const DRY_RUN = process.argv.includes('--dry-run');

interface LegacyOcrEntry {
  contentHash: string;
  mistralFileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  markdown: string;
  pagesProcessed?: number;
  createdAt: string;
}

interface LegacyOcrMemory {
  ocrCache: Record<string, LegacyOcrEntry>;
  lastTouched: string;
}

function buildWorkspaceFs(tenant: TenantContext): LocalFilesystem {
  const parts = [
    WORKSPACE_ROOT,
    String(tenant.schoolId),
    String(tenant.classId ?? 0),
    String(tenant.sectionId ?? 0),
    String(tenant.academicId ?? 0)
  ];
  return new LocalFilesystem({ basePath: parts.join('/') });
}

async function getUserIdFromResourceId(resourceId: string): Promise<number | null> {
  const match = resourceId.match(/^user-(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function main(): Promise<void> {
  await ensureStorageInitialized();
  const assistant = mastra.getAgent('assistant');
  const memory = await assistant.getMemory();
  if (!memory) {
    throw new Error('Assistant agent has no memory configured');
  }

  const legacyThreadIds = (await (memory as any).listThreads({ page: 0, perPage: 1000 }))
    .filter((t: { id: string }) => t.id.startsWith('user-ocr-'))
    .map((t: { id: string; resourceId: string; metadata?: Record<string, unknown> }) => t);

  console.log(`[ocr-migration] Found ${legacyThreadIds.length} legacy OCR thread(s). Dry run: ${DRY_RUN}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const thread of legacyThreadIds) {
    const userId = await getUserIdFromResourceId(thread.resourceId);
    if (!userId) {
      console.warn(`[ocr-migration] Skipping thread ${thread.id} — cannot parse userId from ${thread.resourceId}`);
      skipped++;
      continue;
    }

    const raw = thread.metadata?.workingMemory;
    if (typeof raw !== 'string' || raw.length === 0) {
      console.warn(`[ocr-migration] Skipping thread ${thread.id} — empty workingMemory`);
      skipped++;
      continue;
    }

    let cache: LegacyOcrMemory;
    try {
      cache = JSON.parse(raw);
    } catch (err) {
      console.warn(`[ocr-migration] Skipping thread ${thread.id} — corrupt workingMemory`, err);
      skipped++;
      continue;
    }

    const tenant: TenantContext = createTenantContext({
      schoolId: 1,
      userId,
      designationId: 1,
      staffId: userId,
      classId: null,
      sectionId: null,
      examId: null,
      academicId: null
    });
    const fs = buildWorkspaceFs(tenant);

    const entries = Object.values(cache.ocrCache);
    console.log(`[ocr-migration] Thread ${thread.id} → user ${userId} (${entries.length} entries)`);

    let allWrote = true;
    for (const entry of entries) {
      const mdPath = `extracted/${entry.contentHash}.md`;
      const metaPath = `extracted/${entry.contentHash}.meta.json`;
      try {
        if (await fs.exists(mdPath)) {
          continue;
        }
        if (!DRY_RUN) {
          await fs.writeFile(mdPath, entry.markdown, { recursive: true });
          await fs.writeFile(
            metaPath,
            JSON.stringify({
              contentHash: entry.contentHash,
              mistralFileId: entry.mistralFileId,
              fileName: entry.fileName,
              mimeType: entry.mimeType,
              sizeBytes: entry.sizeBytes,
              pagesProcessed: entry.pagesProcessed,
              createdAt: entry.createdAt
            }),
            { recursive: true }
          );
        }
        console.log(`  ✓ ${entry.contentHash.slice(0, 8)}… → ${mdPath}`);
      } catch (err) {
        console.error(`  ✗ ${entry.contentHash}: ${err instanceof Error ? err.message : err}`);
        allWrote = false;
      }
    }

    if (allWrote && !DRY_RUN) {
      try {
        await (memory as any).deleteThread(thread.id);
        console.log(`  🗑  dropped thread ${thread.id}`);
        migrated++;
      } catch (err) {
        console.error(`  ✗ failed to drop thread ${thread.id}:`, err);
        failed++;
      }
    } else if (allWrote) {
      migrated++;
    } else {
      failed++;
    }
  }

  console.log(`[ocr-migration] Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
}

void main().catch((err) => {
  console.error('[ocr-migration] Fatal:', err);
  process.exit(1);
});
