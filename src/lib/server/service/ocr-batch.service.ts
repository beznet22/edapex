/**
 * OcrBatchService — EdApex
 *
 * Orchestrates Mistral's Batch API for OCR extraction. Built around the
 * official pattern documented at
 *   https://docs.mistral.ai/resources/cookbooks/mistral-ocr-batch_ocr
 *
 * Flow:
 *   1. `startBatch(tenant, files)` — for each file, read bytes from the
 *      tenant workspace, upload to Mistral as `purpose: "ocr"`, build a
 *      JSONL batch spec, upload the JSONL with `purpose: "batch"`, then
 *      create the batch job via `client.batch.jobs.create`. Returns
 *      `{ jobId, total }` for the worker to poll.
 *   2. `pollBatch(jobId)` — wraps `client.batch.jobs.get` and returns a
 *      normalised shape (status, succeeded/failed/total counts, outputFileId).
 *   3. `finalizeBatch(tenant, jobId, keys)` — downloads the batch output
 *      JSONL, parses per-request results, persists each via
 *      `OcrWorkspaceStore.getOrCreate` (content-hash cache hit if re-run).
 *
 * The polling loop itself lives in the worker (see `task-worker.ts`); this
 * service exposes the three primitives the worker calls via `fetch`.
 */
import { Mistral } from "@mistralai/mistralai";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "$env/dynamic/private";
import { tenantWorkspace } from "$lib/server/workspace";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import {
  createTenantContext,
  type TenantContext,
} from "$lib/server/mastra/tenant-context";
import { OcrWorkspaceStore } from "$lib/server/mastra/storage/ocr/ocr-workspace-store";
import type { SerializedTenant } from "$lib/types/background-tasks";
import { resolveMistralApiKey } from "$lib/server/mastra/provider/ocr-key-resolver";

export type StartBatchResult = {
  jobId: string;
  total: number;
};

export type PollBatchResult = {
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  succeeded: number;
  failed: number;
  total: number;
  outputFileId?: string;
  errorFileId?: string;
};

export type FinalizeBatchResult = {
  results: Array<{
    key: string;
    status: "success" | "error";
    contentHash?: string;
    mistralFileId?: string;
    error?: string;
  }>;
};

export class OcrBatchService {
  private static instance: OcrBatchService;

  private constructor() {}

  public static getInstance(): OcrBatchService {
    if (!OcrBatchService.instance) {
      OcrBatchService.instance = new OcrBatchService();
    }
    return OcrBatchService.instance;
  }

  private async getClient(tenant: SerializedTenant, db: LibSQLDatabase<any>): Promise<Mistral> {
    const apiKey = await resolveMistralApiKey({
      db,
      userId: tenant.userId,
      schoolId: tenant.schoolId,
      userRole: null,
      env: env as Record<string, string | undefined>
    });
    return new Mistral({ apiKey });
  }

  /**
   * Reconstruct a `TenantContext` from the JSON-serialised form the worker
   * sends. Mirrors `createTenantContext` defaults; only the fields we
   * actually serialise are populated.
   */
  private rehydrateTenant(tenant: SerializedTenant): TenantContext {
    return createTenantContext({
      schoolId: tenant.schoolId,
      userId: tenant.userId,
      designationId: tenant.designationId,
      staffId: tenant.staffId,
      classId: tenant.classId,
      sectionId: tenant.sectionId,
      examTypeId: tenant.examTypeId,
      academicId: tenant.academicId,
      className: tenant.className,
      sectionName: tenant.sectionName,
      academicYearTitle: tenant.academicYearTitle,
    });
  }

  /**
   * Read the raw bytes of every file in `keys` from the tenant workspace.
   * Returns a parallel array of `{ key, name, bytes }` in input order.
   */
  private async readFiles(
    tenant: TenantContext,
    keys: string[],
  ): Promise<Array<{ key: string; name: string; bytes: Uint8Array; mimeType: string }>> {
    const requestContext = buildWorkspaceRequestContext(tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) throw new Error("Tenant workspace filesystem unavailable");

    const out: Array<{ key: string; name: string; bytes: Uint8Array; mimeType: string }> = [];
    for (const key of keys) {
      const buf = await fs.readFile(key);
      const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
      const name = key.split("/").pop() ?? key;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = mimeForExt(ext);
      out.push({ key, name, bytes, mimeType });
    }
    return out;
  }

  /**
   * Start a new Mistral batch OCR job for the given workspace keys.
   * Uploads each file individually first, then submits a batch spec
   * referencing all the resulting `fileId`s.
   */
  async startBatch(tenant: SerializedTenant, keys: string[], db: LibSQLDatabase<any>): Promise<StartBatchResult> {
    if (keys.length === 0) {
      throw new Error("No files supplied for batch OCR");
    }

    const t = this.rehydrateTenant(tenant);
    const files = await this.readFiles(t, keys);

    const client = await this.getClient(tenant, db);
    const requests: Array<{ custom_id: string; body: unknown }> = [];
    const keyByCustomId = new Map<string, string>();

    for (const file of files) {
      const blob = new Blob([file.bytes as unknown as ArrayBuffer], { type: file.mimeType });
      const uploaded = await client.files.upload({
        file: { fileName: file.name, content: blob },
        purpose: "ocr",
      });

      const customId = file.key;
      keyByCustomId.set(customId, file.key);
      requests.push({
        custom_id: customId,
        body: {
          model: "mistral-ocr-latest",
          document: { type: "file", file_id: uploaded.id },
          include_image_base64: true,
        },
      });
    }

    const jsonl = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const jsonlBlob = new Blob([jsonl], { type: "application/jsonl" });
    const jsonlFile = await client.files.upload({
      file: { fileName: `library-batch-${Date.now()}.jsonl`, content: jsonlBlob },
      purpose: "batch",
    });

    const job = await client.batch.jobs.create({
      inputFiles: [jsonlFile.id],
      model: "mistral-ocr-latest",
      endpoint: "/v1/ocr",
      metadata: { job_type: "library-extract" },
    });

    return { jobId: job.id, total: requests.length };
  }

  /**
   * Poll a batch job and return normalised status counts. The worker calls
   * this in a loop; the server itself is stateless.
   */
  async pollBatch(
    jobId: string,
    tenant: SerializedTenant,
    db: LibSQLDatabase<any>,
  ): Promise<PollBatchResult> {
    const client = await this.getClient(tenant, db);
    const job = await client.batch.jobs.get({ jobId });

    const status = (job.status ?? "QUEUED") as PollBatchResult["status"];
    return {
      status,
      succeeded: job.succeededRequests ?? 0,
      failed: job.failedRequests ?? 0,
      total: job.totalRequests ?? 0,
      outputFileId: job.outputFile ?? undefined,
      errorFileId: job.errorFile ?? undefined,
    };
  }

  /**
   * Request cancellation of a running Mistral batch job. Fire-and-forget;
   * the next `pollBatch` call will see the job in `CANCELLATION_REQUESTED`
   * then `CANCELLED`. Used by the worker when the user clicks Cancel
   * in the popover or when the local 5-min poll cap hits.
   */
  async cancelBatch(
    jobId: string,
    tenant: SerializedTenant,
    db: LibSQLDatabase<any>,
  ): Promise<void> {
    const client = await this.getClient(tenant, db);
    await client.batch.jobs.cancel({ jobId });
  }

  /**
   * Download the batch output, parse JSONL, and persist each successful
   * result via the OCR workspace store. Returns one entry per input key
   * (in input order), with `status: "error"` for any per-request failures
   * and `error` populated.
   */
  async finalizeBatch(
    tenant: SerializedTenant,
    jobId: string,
    keys: string[],
    db: LibSQLDatabase<any>,
  ): Promise<FinalizeBatchResult> {
    const t = this.rehydrateTenant(tenant);
    const client = await this.getClient(tenant, db);

    const polled = await this.pollBatch(jobId, tenant, db);
    if (!polled.outputFileId) {
      return {
        results: keys.map((k) => ({
          key: k,
          status: "error",
          error: `Batch ended with status ${polled.status} and no output file`,
        })),
      };
    }

    const stream = await client.files.download({ fileId: polled.outputFileId });
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8");
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const byCustomId = new Map<string, { markdown: string; fileId?: string }>();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          custom_id?: string;
          response?: { body?: { file_id?: string; pages?: Array<{ markdown?: string }> } };
        };
        const customId = parsed.custom_id;
        const body = parsed.response?.body;
        if (!customId || !body) continue;
        const markdown = (body.pages ?? []).map((p) => p.markdown ?? "").join("\n\n");
        byCustomId.set(customId, { markdown, fileId: body.file_id });
      } catch {
        // skip malformed line
      }
    }

    const results: FinalizeBatchResult["results"] = [];
    for (const key of keys) {
      const entry = byCustomId.get(key);
      if (!entry || !entry.markdown) {
        results.push({ key, status: "error", error: "No OCR result in batch output" });
        continue;
      }
      try {
        const persisted = await OcrWorkspaceStore.getOrCreate({
          tenant: t,
          file: new Blob([entry.markdown], { type: "text/markdown" }),
          fileName: `${key.split("/").pop() ?? "ocr"}.md`,
          db,
          userId: tenant.userId,
        });
        results.push({
          key,
          status: "success",
          contentHash: persisted.contentHash,
          mistralFileId: persisted.mistralFileId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ key, status: "error", error: message });
      }
    }

    return { results };
  }
}

function mimeForExt(ext: string): string {
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "bmp": return "image/bmp";
    case "tiff":
    case "tif": return "image/tiff";
    default: return "application/octet-stream";
  }
}

export const ocrBatchService = OcrBatchService.getInstance();
