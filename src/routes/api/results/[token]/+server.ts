import { generate } from "$lib/server/helpers/pdf-generator";
import { result } from "$lib/server/service/result.service";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import type { RequestHandler } from "@sveltejs/kit";
import { base64url } from "jose";
import { render } from "svelte/server";
import { error, json } from "@sveltejs/kit";
import { pageToHtml } from "$lib/server/helpers";
export const GET: RequestHandler = async ({ url, params }) => {
  try {
    const { token } = params;
    if (!token) return new Response("Invalid token", { status: 400 });
    const preview = url.searchParams.get("preview") !== null;

    const decoded = base64url.decode(token.split(".")[0]);
    const jsonString = new TextDecoder().decode(decoded);
    const { studentId, examId } = JSON.parse(jsonString);

    const resultData = await result.getStudentResult(studentId, examId, preview);
    if (!resultData) throw new Error("Result not found");
    const props = { data: resultData };
    const { body, head } = render(ResultTemplate, { props });

    const html = pageToHtml(body, head);
    const student = resultData.student;
    const fileName = `res_${student.fullName}_a${student.adminNo}_e${examId}_${Date.now()}`;

    const pdfResult = await generate(html, fileName, preview);
    if (!pdfResult.success) throw new Error(pdfResult.error || "Failed to generate document");

    if (preview) {
      // Return ZIP file containing both images and PDF
      if (!pdfResult.zipBuffer) throw new Error("ZIP buffer not found in preview mode");

      return new Response(pdfResult.zipBuffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename=${fileName}_files.zip`,
        },
      });
    } else {
      // Return PDF file
      if (!pdfResult.pdfBuffer) throw new Error("PDF buffer not found in PDF mode");

      return new Response(pdfResult.pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=${fileName}.pdf`,
        },
      });
    }
  } catch (e) {
    console.error(e);
    return error(500, "Failed to generate document");
  }
};
