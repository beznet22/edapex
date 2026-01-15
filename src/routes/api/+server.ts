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
import { studentRepo } from "$lib/server/repository/student.repo";
import { resultRepo } from "$lib/server/repository/result.repo";
import { id } from "zod/v4/locales";

export const GET: RequestHandler = async () => {
  try {
    const students = await studentRepo.getStudentsByClassSection({ classId: 20, sectionId: 5 })
    const studentRecord = await studentRepo.getStudentRecordByAdmissionNo(961)
    // const resultData = await result.getStudentResult({ id: 167, examId: 5 })
    // const validated = await resultOutputSchema.safeParseAsync(resultData)
    // if (!validated.success) {
    //   return json({ success: false, error: validated.error.issues })
    // }

    return json({studentRecord})

    const response = await result.publishResults({ studentIds: [144], examId: 5 });
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