import { STATIC_DIR } from "$lib/constants";
import { eq } from "drizzle-orm";
import { smGeneralSettings, smStudents } from "$lib/server/db/sms-schema";
import { getDatabase } from "$lib/server/db";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { OcrWorkspaceStore } from "$lib/server/mastra/storage/ocr/ocr-workspace-store";
import { addEntry as addWorkspaceEntry } from "$lib/server/mastra/storage/workspaces/manifest-store";
import { uploadPath } from "$lib/server/mastra/storage/workspaces/paths";
import { resolveTenantFilesystem } from "$lib/server/mastra/storage/workspaces/resolve-tenant-filesystem";
import { mistralOcrService } from "$lib/server/service/mistral-ocr.service";
import { ocrMarkdownPath, ocrMetaPath } from "$lib/server/mastra/storage/workspaces/paths";
import { ResultsRepository, BaseRepository } from "$lib/server/repository";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
import { buildWorkspaceRequestContext, resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { log } from "$lib/server/audit-log";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { mkdirSync, writeFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { join } from "path";

type UploadKind = "document" | "photo" | "studentPhoto" | "logo";

function getFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getFormNumber(formData: FormData, key: string): number | null {
  const raw = getFormString(formData, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFormFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File ? value : null;
}

function normalizeKind(raw: string | null): UploadKind {
  if (raw === "photo" || raw === "studentPhoto" || raw === "logo") return raw;
  return "document";
}

// Mirrors src/routes/+layout.server.ts so the API can independently gate
// uploads that mutate school-wide config. Logos are a PlatformTab mutation,
// so only admin/IT staff may upload them.
function isAdminOrIt(user: NonNullable<App.Locals["user"]>): boolean {
  return user.isAdministrator === true || user.designation === "it";
}

const STRUCTURED_OCR_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    school: { type: "object" },
    student: { type: "object" },
    subjects: { type: "array" },
    records: { type: "array" },
    score: { type: "object" },
  },
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty request received");

  const formData = await request.formData();
  const file = getFormFile(formData, "file");
  const filename = getFormString(formData, "filename") ?? file?.name ?? null;
  const kind = normalizeKind(getFormString(formData, "kind"));
  const studentId = getFormNumber(formData, "studentId");
  const formClassId = getFormNumber(formData, "classId");
  const formSectionId = getFormNumber(formData, "sectionId");

  if (!file || !filename) error(400, "Missing file or filename");

  // SINGLE SOURCE OF TRUTH for workspace scoping. Reads the
  // selected-class cookie (canonical), fetches the active academic
  // year + current term from DB, and returns a fully-built TenantContext.
  // Form data classId/sectionId are passed as fallback (used only if
  // the cookie is missing). Both endpoints and the workflow read from
  // the same helper, so workspace paths always agree.
  const db = await getDatabase();
  const { tenant } = await resolveWorkspaceContext(cookies, {
    id: user.id,
    schoolId: user.schoolId ?? null,
    staffId: user.staffId ?? null,
    designationId: (user as { designationId?: number } | undefined)?.designationId ?? null,
    roleId: (user as { roleId?: number | null } | undefined)?.roleId ?? null
  });
  // Form data overrides cookie only when cookie didn't provide them
  // (the helper already returns nulls in that case).
  if (tenant.classId === null && formClassId !== null) (tenant as { classId: number | null }).classId = formClassId;
  if (tenant.sectionId === null && formSectionId !== null) (tenant as { sectionId: number | null }).sectionId = formSectionId;
  console.log('[uploads] workspace scoping:', {
    classId: tenant.classId,
    sectionId: tenant.sectionId,
    academicId: tenant.academicId,
    academicYearTitle: tenant.academicYearTitle
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("md5").update(buffer).digest("hex");
  const ext = filename.split(".").pop() ?? "bin";

  if (kind === "studentPhoto") {
    if (!studentId) error(400, "studentId required for studentPhoto kind");
    const relativePath = `public/uploads/students/${contentHash}.${ext}`;
    const fullPath = join(STATIC_DIR, relativePath);
    mkdirSync(join(STATIC_DIR, "public/uploads/students"), { recursive: true });
    writeFileSync(fullPath, buffer);
    const photoUrl = `/uploads/students/${contentHash}.${ext}`;
    await db
      .update(smStudents)
      .set({ studentPhoto: photoUrl })
      .where(eq(smStudents.id, studentId));
    return json({
      success: true,
      kind: "studentPhoto" as const,
      photoUrl,
    });
  }

  if (kind === "photo") {
    return json({
      success: true,
      kind: "photo" as const,
      contentHash,
      url: `/api/file/photos/${contentHash}.${ext}`,
      mimeType: file.type,
      size: file.size,
    });
  }

  if (kind === "logo") {
    if (!isAdminOrIt(user)) error(403, "Logo upload requires admin or IT role");
    if (!file.type.startsWith("image/")) error(400, "Logo must be an image");

    const logoSchoolId = user.schoolId ?? 1;
    const logoDir = join(STATIC_DIR, "uploads", "logos");
    mkdirSync(logoDir, { recursive: true });
    const logoFilename = `${logoSchoolId}.${ext}`;
    const logoPath = join(logoDir, logoFilename);
    writeFileSync(logoPath, buffer);
    const logoUrl = `/uploads/logos/${logoFilename}`;

    // smGeneralSettings.logo is a single-row-per-school identity record;
    // the BaseRepository caches it with a 5-minute TTL, so the new logo
    // becomes visible (header, report headers, login page) on the next
    // request after the cache expires. No cache invalidation here — the
    // TTL is short enough that the next page load is acceptable.
    const existing = await db
      .select({ id: smGeneralSettings.id })
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, logoSchoolId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(smGeneralSettings).values({
        schoolName: null,
        siteTitle: null,
        schoolCode: null,
        address: null,
        phone: null,
        email: null,
        currency: "USD",
        currencySymbol: "$",
        currencyFormat: "'symbol_amount'",
        logo: logoUrl,
        favicon: null,
        systemVersion: "8.2.3",
        activeStatus: 1,
        currencyCode: "USD",
        languageName: "en",
        sessionYear: "2020",
        apiUrl: 1,
        websiteBtn: 1,
        dashboardBtn: 1,
        reportBtn: 1,
        styleBtn: 1,
        ltlRtlBtn: 1,
        langBtn: 1,
        ttlRtl: 2,
        phoneNumberPrivacy: 1,
        attendanceLayout: 1,
        ssPageLoad: 3,
        subTopicEnable: 1,
        schoolId: logoSchoolId
      });
    } else {
      await db
        .update(smGeneralSettings)
        .set({ logo: logoUrl })
        .where(eq(smGeneralSettings.schoolId, logoSchoolId));
    }

    // Audit trail: only write if the actor has a staffId. The schema
    // requires actorStaffId to be a number, so unauthenticated-but-typed
    // edge cases (e.g. principal logins where staffId isn't populated)
    // are skipped rather than logged with a sentinel value.
    if (typeof user.staffId === "number") {
      const previous = await db
        .select({ logo: smGeneralSettings.logo })
        .from(smGeneralSettings)
        .where(eq(smGeneralSettings.schoolId, logoSchoolId))
        .limit(1);
      await log({
        schoolId: logoSchoolId,
        actorStaffId: user.staffId,
        action: "update",
        entityType: "smGeneralSettings.logo",
        entityId: String(logoSchoolId),
        before: { logo: previous[0]?.logo ?? null },
        after: { logo: logoUrl }
      });
    }

    return json({
      success: true,
      kind: "logo" as const,
      logoUrl,
      contentHash,
      mimeType: file.type,
      size: file.size
    });
  }

  const documentId = randomUUID();

  // Save the original upload to the workspace at the canonical uploads/
  // path so it can be re-extracted later and discovered via @file mention.
  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await resolveTenantFilesystem({ requestContext: requestContext as never });
  await fs.writeFile(uploadPath(filename), buffer, { recursive: true });

  // Register the upload in the single workspace manifest.json (kind:
  // user-file). The legacy `extracted/manifest.json` is gone.
  await addWorkspaceEntry(tenant, {
    path: uploadPath(filename),
    kind: "user-file",
    documentId,
    fileName: filename,
    contentHash,
    uploadedAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    mimeType: file.type,
    sizeBytes: file.size
  });

  // Trigger Mistral OCR on the uploaded image. Writes the canonical
  // ocr/<fileName>.md + ocr/<fileName>.meta.json so format-marksheet-
  // document can pick it up immediately. OCR failures are non-fatal
  // for the upload itself — we just surface the status in the response
  // so the client pill can show a retry/errror indicator.
  let ocrStatus: 'ready' | 'error' | 'skipped' = 'skipped';
  let ocrError: string | null = null;
  try {
    const isImage = (file.type ?? '').startsWith('image/') ||
      /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(filename);
    if (isImage) {
      // Skip Mistral OCR if the canonical ocr/<fileName>.md already exists
      // — saves the monthly Mistral trial quota when the user re-uploads
      // the same marksheet. format-marksheet-document reads from this same
      // path, so a cached OCR is consumed normally downstream.
      const ocrPath = ocrMarkdownPath(filename);
      if (await fs.exists(ocrPath)) {
        ocrStatus = 'ready';
        console.info(`[uploads] OCR cache hit for ${filename}, skipping Mistral call`);
      } else {
        const ocrResult = await mistralOcrService.processDocument(buffer, filename);
        const markdown = ((ocrResult as { pages?: Array<{ markdown?: string }> }).pages ?? [])
          .map((p) => p.markdown ?? '')
          .filter(Boolean)
          .join('\n\n');
        await fs.writeFile(ocrPath, markdown, { recursive: true });
        await fs.writeFile(
          ocrMetaPath(filename),
          JSON.stringify(
            {
              fileName: filename,
              contentHash,
              pages: (ocrResult as { pages?: unknown }).pages ?? null,
              model: (ocrResult as { model?: string }).model ?? null,
              extractedAt: new Date().toISOString()
            },
            null,
            2
          ),
          { recursive: true }
        );
        // Register both entries (only on fresh OCR; cache hits already
        // have them from the first upload's manifest).
        await addWorkspaceEntry(tenant, {
          path: ocrPath,
          kind: 'ocr-markdown',
          fileName: filename,
          contentHash,
          uploadedAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          mimeType: 'text/markdown'
        });
        await addWorkspaceEntry(tenant, {
          path: ocrMetaPath(filename),
          kind: 'ocr-meta',
          fileName: filename,
          contentHash,
          uploadedAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          mimeType: 'application/json'
        });
        ocrStatus = 'ready';
      }
    }
  } catch (err) {
    ocrStatus = 'error';
    ocrError = err instanceof Error ? err.message : String(err);
    console.error('[uploads] OCR failed for', filename, err);
  }

  return json({
    success: true,
    kind: "document" as const,
    documentId,
    contentHash,
    fileId: contentHash,
    ocrStatus,
    ocrError
  });
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  const clearAll = url.searchParams.get("clear") === "all";
  const filename = url.searchParams.get("filename");
  const fileId = url.searchParams.get("fileId");

  const targetPath = fileId || filename;
  if (!targetPath) return json({ success: false, message: "No filename or fileId provided" });

  // Resolve active academic year so the workspace lookup lands on the
  // canonical AY<a>-<slug>/... path instead of AY0-0.
  const deleteDb = await getDatabase();
  const deleteBaseRepo = await BaseRepository.build(deleteDb);
  const deleteActiveYear = await deleteBaseRepo.getActiveAcademicYear().catch(() => null);

  const deleteTenant = createTenantContext({
    schoolId: user.schoolId ?? 1,
    userId: user.id,
    staffId: user.staffId ?? 1,
    academicId: deleteActiveYear?.id ?? null,
    academicYearTitle: deleteActiveYear?.title ?? null,
  });
  const deleteFileStorage = await createTenantFileStorage(deleteTenant);
  const deleteProvider = new ScopedRepositoryProvider(deleteDb, deleteTenant);
  void deleteProvider;

  if (clearAll) {
    await deleteFileStorage.clearAll();
    return json({ success: true });
  }

  const studentFolder = (targetPath.includes('/') ? targetPath.split('/').pop() : targetPath.split('.')[0]) || targetPath;
  const normalizedFolder = deleteFileStorage.formatName(studentFolder);

  try {
    const assessmentData = await deleteFileStorage.load(normalizedFolder);

    if (assessmentData?.data?.studentData) {
      const { studentId, classId, sectionId, recordId, examTypeId } = assessmentData.data.studentData;
      if (studentId && classId && sectionId && recordId && examTypeId) {
        const schoolId = assessmentData.data.studentData.schoolId || 1;
        const cleanupTenant = createTenantContext({
          schoolId,
          userId: user.id,
          staffId: user.staffId ?? 1,
          classId,
          sectionId,
          academicId: deleteActiveYear?.id ?? null,
          academicYearTitle: deleteActiveYear?.title ?? null,
        });
        const cleanupProvider = new ScopedRepositoryProvider(await getDatabase(), cleanupTenant);
        await cleanupProvider.getRepo(ResultsRepository).cleanMarks({
          recordId,
          studentId,
          classId,
          sectionId,
          examTermId: examTypeId,
          schoolId,
        });
      }
    }

    await deleteFileStorage.deleteStudentFolder(normalizedFolder);
    return json({ success: true });
  } catch (e) {
    console.error("Deletion error:", e);
    return json({ success: false, message: e instanceof Error ? e.message : "Internal deletion error" });
  }
};
