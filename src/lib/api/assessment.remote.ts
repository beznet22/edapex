import { command, getRequestEvent } from "$app/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { staffRepo, studentRepo, resultRepo } from "$lib/server/repository";
import { assessment } from "$lib/server/service/assessment.service";
import { studentFileStorage } from "$lib/server/storage/student-files";
import { render } from "svelte/server";
import z from "zod";

export const generateResultPdf = command(
  z.object({
    studentId: z.number(),
    examId: z.number(),
  }),
  async ({ studentId, examId }) => {
    try {
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

      // Update extracted assessment status to "published"
      const student = await studentRepo.getStudentById(studentId);
      if (student && student.classId && student.sectionId) {
        const extracted = await studentFileStorage.loadByStudent(student.classId, student.sectionId, studentId, examTypeId);
        if (extracted) {
          extracted.status = "published";
          await studentFileStorage.save(extracted);
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
      if (designation === "class_teacher") {
        const assigned = await assessment.assignSubjects(classId, sectionId, user.staffId);
        if (!assigned || !user.staffId) return { success: false, message: "Failed to assign subjects" };
        staffId = user.staffId;
      }

      if (
        designation === "coordinator" ||
        designation === "it"
      ) {
        const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
        if (!staff.teacherId) return { success: false, message: "Class not assigned to any teacher" };
        staffId = staff.teacherId;
      }

      const students = await studentRepo.getStudentsByStaffId(staffId);
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
      return await assessment.runExtraction({ file, classId, sectionId });
    } catch (error: any) {
      console.error("Failed to upload file", error);
      return { success: false, status: "error", error: error.message };
    }
  }
);
