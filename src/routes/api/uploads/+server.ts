import { STATIC_DIR, EXTRACTED_DIR } from "$lib/constants";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultRepo, staffRepo, studentRepo } from "$lib/server/repository";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { studentFileStorage } from "$lib/server/storage/student-files";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import { existsSync, mkdirSync, rmdirSync, writeFileSync, unlinkSync } from "fs";
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

      await studentRepo.updateStudentPhoto(studentId, relativePath);
      return json({ success: true, status: "uploaded", filename: photoFilename });
    }

    if (!classId || !sectionId) throw new Error("Missing class or section information");
    token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");

    // Handle re-extraction if only filename/fileId is provided
    if (filename && !file) {
      try {
        const buffer = await studentFileStorage.getImage(fileId || filename);
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

    const staff = await staffRepo.getStaffByClassSection({ classId: classId as number, sectionId: sectionId as number });
    // Slice 10: per-request provider
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        staffId: staff.teacherId || undefined,
        classId: classId as number,
        sectionId: sectionId as number,
      }),
    );
    const extractionResult = await assessment.runExtraction({
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

    // If extraction fails but we have a new file, save it as pending in unified storage
    if (!filename && file && className && sectionName) {
      try {
        const storagePath = await studentFileStorage.savePending({
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

export const DELETE: RequestHandler = async ({ url, locals, cookies }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");

  const clearAll = url.searchParams.get("clear") === "all";
  const filename = url.searchParams.get("filename");
  const fileId = url.searchParams.get("fileId");

  const targetPath = fileId || filename;
  if (!targetPath) return json({ success: false, message: "No filename or fileId provided" });

  let staffId: number = user.staffId || 1;
  let token = "";

  const selectedClassRaw = cookies.get("selected-class");
  if (selectedClassRaw) {
    try {
      const cls = JSON.parse(selectedClassRaw);
      if (cls.className && cls.sectionName) {
        token = `${cls.className}(${cls.sectionName})`.toLowerCase().replaceAll(" ", "_");
      }
    } catch (e) {
      console.error("Error parsing selected-class cookie:", e);
    }
  }

  if (!token) {
    const classSection = await resultRepo.getAssignedClassSection(staffId);
    if (classSection?.className && classSection?.sectionName) {
      token = `${classSection.className}(${classSection.sectionName})`.toLowerCase().replaceAll(" ", "_");
    }
  }

  if (clearAll && token) {
    const uploadPath = join(EXTRACTED_DIR, token);
    if (existsSync(uploadPath)) {
      rmdirSync(uploadPath, { recursive: true });
    }
    return json({ success: true });
  }

  const actualPath = targetPath.includes('/') ? targetPath : (token ? join(token, studentFileStorage.formatName(targetPath.split('.')[0] || targetPath)) : targetPath);
  const fullPath = join(EXTRACTED_DIR, actualPath);

  if (existsSync(fullPath)) {
    try {
      // 1. Load assessment data to check for DB record linkages
      const assessmentData = await studentFileStorage.load(actualPath);

      // 2. If it has DB records (marks/results), clean them up
      if (assessmentData?.data?.studentData) {
        const { studentId, classId, sectionId, recordId, examTypeId } = assessmentData.data.studentData;
        if (studentId && classId && sectionId && recordId && examTypeId) {
          const schoolId = assessmentData.data.studentData.schoolId || 1;
          await resultRepo.cleanMarks({
            recordId,
            studentId,
            classId,
            sectionId,
            examTermId: examTypeId,
            schoolId
          });
        }
      }

      // 3. Delete the directory/file from the filesystem
      rmdirSync(fullPath, { recursive: true });
      return json({ success: true });
    } catch (e) {
      console.error("Deletion error:", e);
      return json({ success: false, message: e instanceof Error ? e.message : "Internal deletion error" });
    }
  }

  return json({ success: true, message: "Resource already removed or not found" });
};

function unlink_internal(path: string) {
  try {
    unlinkSync(path);
  } catch (e) {
    console.error("Failed to unlink", path, e);
  }
}


