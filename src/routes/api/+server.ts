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

export const GET: RequestHandler = async () => {
  try {
    const result = await studentRepo.getStudentsByClassId({ classId: 21, sectionId: 5 })

    return json({ success: true, result });
  } catch (e: any) {
    console.error(`Failed to publish result: ${e}`);
    return error(500, e.message);
  }
};