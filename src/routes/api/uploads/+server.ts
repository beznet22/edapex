import { STATIC_DIR } from "$lib/constants";
import { fileSchema } from "$lib/schema/chat-schema";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { ResultsRepository, StaffRepository, StudentRepository } from "$lib/server/repository";
import { createAssessmentOcrServiceForRequest } from "$lib/server/service/assessment-ocr.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { createTenantFileStorage } from "$lib/server/mastra/storage/tenant-file-storage";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty request received");

  let file: any = null;
  let filename: string | null = null;
  let token = "";
  let className = "";
  let sectionName = "";
  let fullName: string | null = null;

  try {
    const formData = await request.formData();
    file = formData.get("file") as File;
    filename = formData.get("filename") as string;
    const classId = formData.get("classId") ? Number(formData.get("classId")) : null;
    const sectionId = formData.get("sectionId") ? Number(formData.get("sectionId")) : null;
    className = formData.get("className") as string;
    sectionName = formData.get("sectionName") as string;
    const studentId = formData.get("studentId") ? Number(formData.get("studentId")) : null;
    fullName = formData.get("studentName") as string | null;
    const admissionNo = formData.get("admissionNo") ? Number(formData.get("admissionNo")) : null;
    const isStudentPhoto = formData.get("isStudentPhoto") === "true";
    const fileId = formData.get("fileId") as string | null;

    if (!file && !filename) throw new Error("No file or filename provided");

    if (isStudentPhoto) {
      if (!studentId) throw new Error("Student ID is required for photo upload");
      const buff = await file.arrayBuffer();
      const buffer = Buffer.from(buff);
      const hash = createHash("md5").update(buffer).digest("hex");
      const ext = file.name.split(".").pop();
      const photoFilename = `${hash}.${ext}`;
      const relativePath = `public/uploads/student/${photoFilename}`;
      const fullPath = join(STATIC_DIR, relativePath);

      const dir = join(STATIC_DIR, "public/uploads/student");
      mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, buffer);

      const photoTenant = createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        staffId: user.staffId ?? undefined,
      });
      const photoProvider = new ScopedRepositoryProvider(await getDatabase(), photoTenant);
      await photoProvider.getRepo(StudentRepository).updateStudentPhoto(studentId, relativePath);
      return json({ success: true, status: "uploaded", filename: photoFilename });
    }

    if (!classId || !sectionId) throw new Error("Missing class or section information");
    token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");

    // Handle re-extraction if only filename/fileId is provided
    if (filename && !file) {
      try {
        const retryTenant = createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
          classId: classId as number,
          sectionId: sectionId as number,
        });
        const retryFileStorage = await createTenantFileStorage(retryTenant);
        const studentFolder = retryFileStorage.formatName((fileId || filename).split("/").pop() || (fileId || filename));
        const buffer = await retryFileStorage.getImage(studentFolder);
        if (buffer) {
          file = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
        } else {
          throw new Error("File not found in storage");
        }
      } catch (err) {
        throw err;
      }
    }

    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      throw new Error(errorMessage);
    }

    const staffLookupTenant = createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: user.staffId ?? undefined,
    });
    const staffLookupProvider = new ScopedRepositoryProvider(await getDatabase(), staffLookupTenant);
    const staff = await staffLookupProvider.getRepo(StaffRepository).getStaffByClassSection({ classId: classId as number, sectionId: sectionId as number });
    // Slice 10: per-request provider
    const tenant = createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      staffId: staff.teacherId || undefined,
      classId: classId as number,
      sectionId: sectionId as number,
    });
    const ocrService = await createAssessmentOcrServiceForRequest(tenant);
    const extractionResult = await ocrService.runExtraction({
      userId: user.id, // Authenticated user ID for AI provider resolution
      teacherId: staff.teacherId || 1, // Staff ID for domain data lookups
      file,
      classId: classId as number,
      sectionId: sectionId as number,
      studentId: studentId ?? undefined,
      fullName: fullName || undefined,
      admissionNo: admissionNo ?? undefined,
      originalName: file.name
    });

    if (!extractionResult) throw new Error("Extraction failed to return results");

    return json({
      ...extractionResult,
      id: extractionResult.storagePath,
      url: `/api/uploads/${extractionResult.storagePath}/image.jpg?token=${token}`,
      status: "extracted",
      filename: fullName || (filename ?? file.name),
      token
    });

  } catch (e) {
    console.error("Upload/Extraction error:", e);

    if (!filename && file && className && sectionName) {
      try {
        const pendingTenant = createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
        });
        const pendingFileStorage = await createTenantFileStorage(pendingTenant);
        const storagePath = await pendingFileStorage.savePending({
          file,
          className,
          sectionName,
          fileName: file.name,
          fullName: fullName ?? undefined,
          status: "error",
          error: e instanceof Error ? e.message : "Extraction failed"
        });

        return json({
          success: true,
          status: "error",
          error: e instanceof Error ? e.message : "Extraction failed",
          storagePath,
          filename: fullName || filename || file.name,
          id: storagePath,
          url: `/api/uploads/${storagePath}/image.jpg?token=${token}`,
          token
        });
      } catch (err) {
        console.error("Failed to save pending file:", err);
      }
    }

    return json({
      success: false,
      status: "error",
      error: e instanceof Error ? e.message : "Failed to upload file, try again",
    });
  }
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
    staffId: user.staffId ?? undefined,
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
          staffId: user.staffId ?? undefined,
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
          schoolId
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


