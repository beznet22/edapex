import { getRequestEvent } from "$app/server";
import { command } from "$app/server";
import z from "zod";
import { generate, pageToHtml } from "$lib/server/helpers/pdf-generator";
import { render } from "svelte/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { result } from "$lib/server/service/result.service";

export const generateResultPdf = command(
  z.object({
    studentId: z.number(),
    examId: z.number(),
  }),
  async ({ studentId, examId }) => {
    try {
      const resultData = await result.getStudentResult(studentId, examId);
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
