/**
 * Single-file Mistral OCR direct endpoint — EdApex
 *
 * Owns the per-file Mistral direct OCR call used by the worker's
 * `process-files` auto-OCR phase. Replaces the `?action=ocr-direct` POST
 * block that used to live inside `/api/file/[...path]`.
 *
 * Mistral's free tier does NOT support the Batch API, so per-file
 * direct calls are the only path available to most tenants. Paid-tier
 * tenants continue to use `/api/file?action=batch-extract` (see the
 * existing `[...path]/+server.ts` POST handler).
 *
 * The tenant is rehydrated from the `tenant` field of the request body
 * (sent by the worker via postMessage) — not from the active session —
 * because the worker carries the originating user's tenant across the
 * thread. The session check still enforces authentication.
 *
 * Wire shape (consumed by the worker):
 *   POST { key: string, tenant: SerializedTenant }
 *   → 200 { success: true, contentHash, manifestStatus: "Extracted" }
 *   → 4xx { success: false, error: string }
 */
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { assertPathAgentVisible, resolveTenantWorkspace, WorkspaceScopeError } from "$lib/server/workspace/scope";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { tenantWorkspace } from "$lib/server/workspace";
import { OcrWorkspaceStore } from "$lib/server/mastra/storage/ocr/ocr-workspace-store";
import { mistralOcrService } from "$lib/server/service/mistral-ocr.service";
import { resolveUserRole } from "$lib/server/mastra/provider/role-resolver";
import { ocrBatchService } from "$lib/server/service/ocr-batch.service";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { updateEntry } from "$lib/server/workspace/manifest";
import type { SerializedTenant } from "$lib/types/background-tasks";

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, "Unauthorized");

    const body = (await request.json()) as {
      key?: string;
      tenant?: SerializedTenant;
    };
    if (!body.key) throw error(400, "Missing 'key' for ocr-direct");
    if (!body.tenant) throw error(400, "Missing 'tenant' for ocr-direct");

    // Authenticate against the session. We still need this so the
    // endpoint is not callable by an unauthenticated client.
    await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId:
        (locals.user as { designationId?: number })?.designationId ??
        ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get("selected-class"),
    });

    // The worker carries the originating user's tenant in the request
    // body, so we rehydrate from body.tenant (not the session).
    const tContext = ocrBatchService["rehydrateTenant"](body.tenant);

    const requestContext = buildWorkspaceRequestContext(tContext);
    const fs = await tenantWorkspace.resolveFilesystem({
      requestContext: requestContext as never,
    });
    if (!fs) throw error(500, "Workspace filesystem unavailable");

    const resolvedPath = assertPathAgentVisible(tContext, body.key);
    const raw = await fs.readFile(resolvedPath);
    const bytes =
      raw instanceof Uint8Array
        ? raw
        : new TextEncoder().encode(String(raw));
    const filename = resolvedPath.split("/").pop() ?? "ocr";

    const ocrResponse = await mistralOcrService.processDocument(bytes, filename, {
      db: getAppDb(),
      userId: tContext.userId,
      schoolId: tContext.schoolId,
      userRole: resolveUserRole(tContext.designationId),
    });

    const pages = (ocrResponse as { pages?: Array<{ markdown?: string }> })
      .pages ?? [];
    const markdown = pages
      .map((p) => p.markdown ?? "")
      .filter(Boolean)
      .join("\n\n");
    const mistralFileId = (ocrResponse as { fileId?: string }).fileId ?? "";

    const persisted = await OcrWorkspaceStore.getOrCreate({
      tenant: tContext,
      file: bytes,
      fileName: filename,
      mimeType: "text/markdown",
      db: getAppDb(),
      userId: tContext.userId,
      precomputed: {
        markdown,
        mistralFileId,
        pagesProcessed: (ocrResponse as { usageInfo?: { pagesProcessed?: number } })
          .usageInfo?.pagesProcessed,
      },
    });

    if (tContext.examTypeId != null) {
      await updateEntry(
        tContext,
        body.key,
        { status: "Extracted" },
        tContext.examTypeId,
      );
    }

    return json({
      success: true,
      contentHash: persisted.contentHash,
      mistralFileId: persisted.mistralFileId,
      manifestStatus: "Extracted",
    });
  } catch (e) {
    if (e instanceof WorkspaceScopeError) {
      return json(
        {
          success: false,
          error: "WORKSPACE_SCOPE_VIOLATION",
          message: e.message,
        },
        { status: 403 },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};
