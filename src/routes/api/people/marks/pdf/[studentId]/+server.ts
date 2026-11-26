import { error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { render } from "svelte/server";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { assertScanScope } from "$lib/server/people/scan/scan-access";
import { guard, requireNumber, resolveScanRequest } from "$lib/server/people/scan/scan-request";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";

/**
 * On-demand result PDF for the preview sheet (plan Gate 4).
 *
 * Rendered in memory and streamed — no temp file, no manifest entry, no status write. The PDF is a
 * *view* of committed data, so generating it must never mutate anything. Committing or publishing
 * remains the only way to change a row.
 */
export const GET: RequestHandler = async ({ url, locals }) =>
  guard(async () => {
  const context = await resolveScanRequest({ user: locals.user, url });
  const studentId = requireNumber(url.searchParams.get("student"), "student");
  const examTypeId = requireNumber(url.searchParams.get("exam"), "exam");

  await assertScanScope({
    user: locals.user,
    studentId,
    examTypeId,
    schoolId: context.schoolId,
    academicId: context.academicId,
    allowedClassSections: context.allowedClassSections,
  });

  const assessment = await createAssessmentServiceForRequest(
    createTenantContext({
      schoolId: context.schoolId,
      userId: context.user.id,
      staffId: context.user.staffId,
      academicId: context.academicId,
      examTypeId,
      studentId,
    })
  );

  // `examId` here is the TERM id (`sm_exam_types`), not `sm_exams.id` — see the note in
  // scan-publish.ts. `getStudentResult` binds it to `sm_result_stores.exam_type_id`.
  const marksheet = await assessment.getStudentResult({
    id: studentId,
    examId: examTypeId,
    withImages: true,
  });
  if (!marksheet) error(404, "No committed result for this student and term");

  const { body, head } = render(ResultTemplate, { props: { data: marksheet } });
  const html = pageToHtml(body, head);

  const result = await generate({
    htmlContent: html,
    fileName: `result_${studentId}_${examTypeId}`,
    returnPath: false,
  });

  if (!result.success || !result.pdfBuffer) {
    error(500, result.error ?? "The result sheet could not be generated");
  }

  return new Response(new Uint8Array(result.pdfBuffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="result-${studentId}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
  });
