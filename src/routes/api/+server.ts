import { resultInputSchema } from "$lib/schema/result-input";
import { resultOutputSchema } from "$lib/schema/result-output";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { result } from "$lib/server/service/result.service";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { readFileSync } from "fs";
import { render } from "svelte/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";

export const GET: RequestHandler = async ({ locals }) => {
  const { session, user } = locals;
  try {
    const filePath = `${process.cwd()}/static/extracted/dc.json`;
    const data = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data);
    const validated = await resultInputSchema.parseAsync(parsed)

    const { studentId, examTypeId } = validated.studentData
    if (!studentId || !examTypeId) return error(400, "Invalid student or exam type ID");
    const resultData = await result.getStudentResult({ id: studentId, examId: examTypeId, withImages: true });
    const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
    if (!validatedResult.success) {
      return json(validatedResult.error.issues)
    }

    console.log(validatedResult.data.student)
    const props = { data: validatedResult.data };
    const { body, head } = render(ResultTemplate, { props });

    const html = pageToHtml(body, head);
    const student = validatedResult.data.student;
    const fileName = `res_${student.fullName}_a${student.adminNo}_e${examTypeId}_${Date.now()}`;

    const pdfResult = await generate(html, fileName);
    if (!pdfResult.success) throw new Error(pdfResult.error || "Failed to generate document");
    if (!pdfResult.pdfBuffer) throw new Error("PDF buffer is missing");
    // return new Response(new Uint8Array(pdfResult.pdfBuffer), {
    //   headers: {
    //     "Content-Type": "application/pdf",
    //     "Content-Disposition": `inline; filename=${fileName}.pdf`,
    //   },
    // });

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename=${fileName}.html`,
      },
    });
  } catch (e: any) {
    return error(500, e.message);
  }
};
