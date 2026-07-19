import { command, getRequestEvent } from "$app/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { StudentRepository, StaffRepository } from "$lib/server/repository";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { getDatabase } from "$lib/server/db";
import { createAssessmentOcrServiceForRequest } from "$lib/server/service/assessment-ocr.service";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { resolveTenantWorkspace } from "$lib/server/workspace/scope";
import { readManifest, addEntry, updateEntry } from "$lib/server/workspace/manifest";
import { render } from "svelte/server";
import z from "zod";

export const generateResultPdf = command(
  z.object({
    studentId: z.number(),
    examId: z.number(),
  }),
  async ({ studentId, examId }) => {
    try {
      // Slice 10: per-request provider
      const assessment = await createAssessmentServiceForRequest(
        createTenantContext({ schoolId: 1, userId: 0 }),
      );
      const resultData = await assessment.getStudentResult({ id: studentId, examId });
      if (!resultData) throw new Error("Result not found");

      const props = { data: resultData };
      const { body, head } = render(ResultTemplate, { props });

      const html = pageToHtml(body, head);
      const fileName = `result_${studentId}_${examId}_${Date.now()}`;
      const pdfResult = await generate(html, fileName);
      if (!pdfResult.success || !pdfResult.pdfBuffer)
        throw new Error(pdfResult.error || "Failed to generate PDF");

      return {
        success: true,
        pdfData: pdfResult.pdfBuffer.toString("base64"),
        student: resultData.student,
      };
    } catch (error) {
      console.error("PDF generation error:", error);
      return { success: false, error: "Failed to generate PDF" };
    }
  }
);

export const publishResult = command(
  z.object({
    studentId: z.number(),
    examTypeId: z.number(),
    resend: z.boolean().optional(),
  }),
  async ({ studentId, examTypeId, resend }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "User not authenticated" };
    }
    try {
      const tenant = createTenantContext({
        schoolId: locals.user.schoolId ?? 1,
        userId: locals.user.id,
        staffId: locals.user.staffId ?? undefined,
      });
      const assessment = await createAssessmentServiceForRequest(tenant);
      const response = await assessment.publishResults({
        studentIds: [studentId],
        examId: examTypeId,
        resend,
      });

      if (!response.success) {
        return {
          success: false,
          message: `Failed to publish result for student ${studentId}.`,
          errors: response.errors,
        };
      }

      const provider = new ScopedRepositoryProvider(await getDatabase(), tenant);
      const student = await provider.getRepo(StudentRepository).getStudentById(studentId);
      if (student) {
        // Update manifest marksheet status to published. Each per-exam
        // manifest is checked independently; we update the one that
        // contains the marksheet for this student.
        if (tenant.examTypeId == null) {
          return { success: false, message: "Cannot publish result without an active exam" };
        }
        const examTypeId = tenant.examTypeId;
        const manifest = await readManifest(tenant, examTypeId);
        for (const [relPath, entry] of Object.entries(manifest.entries)) {
          if (entry.kind === "marksheet-json" && entry.studentId === studentId) {
            try {
              await addEntry(
                tenant,
                { ...entry, marksheetStatus: "published", status: "Published", modifiedAt: new Date().toISOString() },
                examTypeId
              );
              const pubSource = Object.values(manifest.entries).find(
                (e) => e.kind === 'user-file' && e.studentId === studentId
              );
              if (pubSource) {
                await updateEntry(tenant, pubSource.path, { status: 'Published' }, examTypeId);
              }
            } catch {
              // ignore manifest write errors
            }
            break;
          }
        }
      }

      return {
        success: true,
        message: `Result published successfully for student ${studentId}.`,
        result: response.results[0],
      };
    } catch (error) {
      console.error("Publish result error:", error);
      return { success: false, message: "Failed to publish result" };
    }
  }
);

export const assignSubjects = command(
  z.object({
    classId: z.number(),
    sectionId: z.number(),
  }),
  async ({ classId, sectionId }) => {
    const { user, session } = getRequestEvent().locals;
    if (!user || !session) {
      return { success: false, message: "User not authenticated" };
    }

    try {
      const designation = user.designation;
      if (!designation) {
        return { success: false, message: "User not assigned to any designation" };
      }

      let staffId: number = 0;
      const tenant = createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        staffId: user.staffId ?? undefined,
        classId,
        sectionId,
      });
      const provider = new ScopedRepositoryProvider(await getDatabase(), tenant);

      if (designation === "class_teacher") {
        const assessment = await createAssessmentServiceForRequest(tenant);
        const assigned = await assessment.assignSubjects(classId, sectionId, user.staffId);
        if (!assigned || !user.staffId) return { success: false, message: "Failed to assign subjects" };
        staffId = user.staffId;
      }

      if (
        designation === "coordinator" ||
        designation === "it"
      ) {
        const staff = await provider.getRepo(StaffRepository).getStaffByClassSection({ classId, sectionId });
        if (!staff.teacherId) return { success: false, message: "Class not assigned to any teacher" };
        staffId = staff.teacherId;
      }

      const students = await provider.getRepo(StudentRepository).getStudentsByStaffId(staffId);
      return { success: true, assigned: students || [] };
    } catch (error) {
      return { success: false, message: "Failed to upload file" };
    }
  }
);

export const doExtraction = command(
  z.object({
    file: fileSchema,
    classId: z.number(),
    sectionId: z.number(),
  }),
  async ({ file, classId, sectionId }) => {
    const { user } = getRequestEvent().locals;
    if (!user) {
      return { success: false, status: "error", error: "Unauthorized" };
    }
    try {
      const ocrService = await createAssessmentOcrServiceForRequest(
        createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId: user.staffId ?? undefined,
          classId,
          sectionId,
        }),
      );
      return await ocrService.runExtraction({
        file,
        classId,
        sectionId,
        userId: user.id,
        teacherId: user.staffId ?? user.id,
      });
    } catch (error: any) {
      console.error("Failed to upload file", error);
      return { success: false, status: "error", error: error.message };
    }
  }
);
