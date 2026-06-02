import { resultInputSchema } from "$lib/schema/result-input";
import { resultOutputSchema } from "$lib/schema/result-output";
import { pageToHtml } from "$lib/server/helpers";
import { generate } from "$lib/server/helpers/pdf-generator";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { readFileSync } from "fs";
import { render } from "svelte/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { staffRepo, studentRepo, resultRepo } from "$lib/server/repository";


export const GET: RequestHandler = async () => {
  try {
    const students = await studentRepo.getStudentsByClassSection({ classId: 15, sectionId: 5 })
    const studentRecord = await studentRepo.getStudentRecordByAdmissionNo(765)
    const staff = await staffRepo.getStaffByClassSection({ classId: 17, sectionId: 7 })
    // Slice 10: per-request provider
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({ schoolId: 1, userId: 1 }),
    );
    const mappingData = await assessment.getMappingData(staff?.teacherId ?? 0)
    const resultData = await assessment.getStudentResult({ id: 580, examId: 5 })
    const validated = await resultOutputSchema.safeParseAsync(resultData)
    if (!validated.success) {
      return json({ success: false, error: validated.error.issues })
    }

    return json({ mappingData })

    const response = await assessment.publishResults({ studentIds: [144], examId: 5 });
    if (!response.success) {
      return json({
        success: false,
        message: `Failed to send result for student ${144}. ${response.failed} failed.`,
        errors: response.errors,
      })
    }

    return json({
      success: true,
      message: `Result sent successfully for student ${144}.`,
      result: response.results[0],
    })
  } catch (e: any) {
    console.error(`Failed to publish result: ${e}`);
    return error(500, e.message);
  }
};