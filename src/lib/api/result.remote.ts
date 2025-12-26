import { command, getRequestEvent } from "$app/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { pageToHtml } from "$lib/server/helpers";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { generate } from "$lib/server/helpers/pdf-generator";
import { staffRepo } from "$lib/server/repository/staff.repo";
import { studentRepo } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
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
      const designation = user.designation;
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
    console.log(classId, sectionId);
    try {
      const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
      if (!staff.teacherId) throw new Error("Class not assigned to any teacher");

      const mappingData = await result.getMappingData(staff.teacherId);
      const mapString = JSON.stringify(mappingData);
      const { success, content, message } = await generateContent(file, mapString);
      if (!success || !content) {
        throw new Error(message);
      }
      const parsedResult = JSON.parse(content.trim());
      console.log(parsedResult);
      const marks = resultInputSchema.parse(parsedResult);
      const res = await result.upsertStudentResult(marks, staff.teacherId);
      if (!res.success) {
        throw new Error(res.message);
      }

      const validated = resultInputSchema.safeParse(parsedResult);
      if (!validated.success) {
        const error = validated.error.issues.filter(
          issue => issue.code === "custom"
        );
        console.log("Failed to upload file", error);
        throw new Error(error.map(issue => issue.message).join("\n"));
      }

      validated.data.studentData.studentId = res.data?.studentId || null;
      return { success: true, status: "done", studentData: validated.data.studentData, marks: validated.data };
    } catch (error: any) {
      console.error("Failed to upload file", error);
      return { success: false, status: "error", error: error.message };
    }
  }
);
