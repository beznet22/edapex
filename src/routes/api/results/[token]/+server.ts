import { generate } from "$lib/server/helpers/pdf-generator";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import TranscriptTemplate from "$lib/components/template/TranscriptTemplate.svelte";
import type { RequestHandler } from "@sveltejs/kit";
import { base64url } from "jose";
import { render } from "svelte/server";
import { error, json } from "@sveltejs/kit";
import { pageToHtml } from "$lib/server/helpers";
export const GET: RequestHandler = async ({ params }) => {
  try {
    const { token } = params;
    if (!token) return new Response("Invalid token", { status: 400 });

    const decoded = base64url.decode(token.split(".")[0]);
    const jsonString = new TextDecoder().decode(decoded);
    const { studentId, examId, academicId, kind } = JSON.parse(jsonString) as {
      studentId: number;
      examId?: number;
      academicId?: number;
      kind?: "result" | "transcript";
    };
    const renderKind: "result" | "transcript" = kind ?? "result";
    // console.log({ studentId, examId, academicId, renderKind });

    // Slice 10: per-request provider
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({ schoolId: 1, userId: 0 }),
    );

    let html: string;
    let fileName: string;

    if (renderKind === "transcript") {
      if (typeof academicId !== "number") {
        return new Response(JSON.stringify({ error: "academicId required for transcript tokens" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const transcript = await assessment.getTranscript({ studentId, academicId, withImages: true });
      if (!transcript) {
        return new Response(JSON.stringify({ error: "Transcript not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const { body, head } = render(TranscriptTemplate, { props: { data: transcript } });
      html = pageToHtml(body, head);
      fileName = `transcript_${transcript.student.fullName}_a${transcript.student.adminNo}_y${academicId}_${Date.now()}`;
    } else {
      if (typeof examId !== "number") throw new Error("examId required for result tokens");
      const resultData = await assessment.getStudentResult({ id: studentId, examId, withImages: true });
      if (!resultData) throw new Error("Result not found");
      const { body, head } = render(ResultTemplate, { props: { data: resultData } });
      html = pageToHtml(body, head);
      const student = resultData.student;
      fileName = `res_${student.fullName}_a${student.adminNo}_e${examId}_${Date.now()}`;
    }

    const pdfResult = await generate({ htmlContent: html, fileName });
    if (!pdfResult.success) throw new Error(pdfResult.error || "Failed to generate document");

    if (!pdfResult.pdfBuffer) throw new Error("PDF buffer not found in PDF mode");

    return new Response(new Uint8Array(pdfResult.pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=${fileName}.pdf`,
      },
    });
  } catch (e) {
    console.error(e);
    return error(500, "Failed to generate document");
  }
};
