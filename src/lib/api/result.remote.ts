import { command, getRequestEvent } from "$app/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { studentRepo, type ClassStudent } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
import { DESIGNATIONS } from "$lib/types/sms-types";
import { render } from "svelte/server";
import z from "zod";

export const generateResultPdf = command(
  z.object({
    studentId: z.number(),
    examId: z.number(),
  }),
  async ({ studentId, examId }) => {
    try {
      const resultData = await result.getStudentResult({ id: studentId, examId });
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
    provider: z.string(),
    model: z.string(),
  }),
  async ({ provider, model }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "User not authenticated" };
    }
    try {
      // await auth.publishResult(provider, model);
      return { success: true, message: "Result published" };
    } catch (error) {
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
      const designation = DESIGNATIONS[user.designationId || 0];
      if (!designation) {
        return { success: false, message: "User not assigned to any designation" };
      }

      let staffId: number = 0;
      if (designation === "class_teacher") {
        const assigned = await result.assignSubjects(classId, sectionId, user.staffId);
        if (!assigned || !user.staffId) return { success: false, message: "Failed to assign subjects" };
        staffId = user.staffId;
      }

      if (
        designation === "eyfs_coodinator" ||
        designation === "graders_coordinator" ||
        designation === "admin"
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
