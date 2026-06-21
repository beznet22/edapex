import { STATIC_DIR } from "$lib/constants";
import { eq } from "drizzle-orm";
import { smStudents } from "$lib/server/db/sms-schema";
import { getDatabase } from "$lib/server/db";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { OcrWorkspaceStore } from "$lib/server/mastra/storage/ocr/ocr-workspace-store";
import { addDocument } from "$lib/server/mastra/storage/ocr/manifest-store";
import { mistralOcrService } from "$lib/server/service/mistral-ocr.service";
import { ResultsRepository } from "$lib/server/repository";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { mkdirSync, writeFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { join } from "path";

type UploadKind = "document" | "photo" | "studentPhoto";

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
  if (raw === "photo" || raw === "studentPhoto") return raw;
  return "document";
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

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty request received");

  const formData = await request.formData();
  const file = getFormFile(formData, "file");
  const filename = getFormString(formData, "filename") ?? file?.name ?? null;
  const kind = normalizeKind(getFormString(formData, "kind"));
  const studentId = getFormNumber(formData, "studentId");
  const classId = getFormNumber(formData, "classId");
  const sectionId = getFormNumber(formData, "sectionId");

  if (!file || !filename) error(400, "Missing file or filename");

  const tenant = createTenantContext({
    schoolId: user.schoolId ?? 1,
    userId: user.id,
    staffId: user.staffId ?? 1,
    designationId: (user as { designationId?: number }).designationId ?? ALLOWED_DESIGNATIONS.IT,
    classId,
    sectionId,
    examTypeId: null,
    examId: null,
    academicId: null,
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
    const db = await getDatabase();
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

  const documentId = randomUUID();
  const normalizedJson = await mistralOcrService.processStructured(
    file,
    filename,
    STRUCTURED_OCR_SCHEMA,
  );
  await OcrWorkspaceStore.writeNormalizedJson(tenant, documentId, normalizedJson);
  await addDocument(tenant, {
    documentId,
    contentHash,
    fileName: filename,
    mimeType: file.type,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    status: "pending",
  });
  return json({
    success: true,
    kind: "document" as const,
    documentId,
    contentHash,
    fileId: contentHash,
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

  const deleteTenant = createTenantContext({
    schoolId: user.schoolId ?? 1,
    userId: user.id,
    staffId: user.staffId ?? 1,
  });
  const deleteFileStorage = await createTenantFileStorage(deleteTenant);
  const deleteProvider = new ScopedRepositoryProvider(await getDatabase(), deleteTenant);
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
