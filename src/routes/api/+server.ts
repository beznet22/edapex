import { resultInputSchema } from "$lib/schema/result-input";
import { resultOutputSchema } from "$lib/schema/result-output";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { result } from "$lib/server/service/result.service";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { readFileSync } from "fs";
import { render } from "svelte/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { staffRepo } from "$lib/server/repository/staff.repo";

export const GET: RequestHandler = async () => {
  try {
    const filePath = `${process.cwd()}/static/extracted/parsed.json`;
    const data = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data);
    const validated = await resultInputSchema.parseAsync(parsed)

    const resultData = await result.getStudentResult({ id: 144, examId: 5, withImages: true });
    const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
    if (!validatedResult.success || !resultData) {
      console.warn(`Validation failed for student ${144}`);
      return error(400, "Validation failed");
    }
    const { student, school } = validatedResult.data;

    const pdfProps = { data: resultData };
    let { body, head } = render(ResultTemplate, { props: pdfProps });
    let html = pageToHtml(body, head);
    const fileName = `res_${student.fullName}_a${student.adminNo}_e${5}_${Date.now()}`;

    const pdfResult = await generate({ htmlContent: html, fileName });
    if (!pdfResult.success) throw new Error(pdfResult.error || "Failed to generate document");
    if (!pdfResult.pdfBuffer) throw new Error("PDF buffer is missing");

    return new Response(new Uint8Array(pdfResult.pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });

  } catch (e: any) {
    return error(500, e.message);
  }
};