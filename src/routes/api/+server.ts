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
import { resultRepo } from "$lib/server/repository/result.repo";

export const GET: RequestHandler = async () => {
  try {
    // const filePath = `${process.cwd()}/static/extracted/parsed.json`;
    // const data = readFileSync(filePath, "utf-8");
    // const parsed = JSON.parse(data);
    // const validated = await resultInputSchema.parseAsync(parsed)
    // const { studentId, examTypeId } = validated.studentData;
    // if (!studentId || !examTypeId) return error(400, "Invalid student or exam type ID");

    const resultData = await result.getStudentResult({ id: 138, examId: 5 });
    const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
    if (!validatedResult.success || !resultData) {
      return json({ success: false, issue: validatedResult.error?.issues });
    }

    return json({ success: true, issue: validatedResult.data });
  } catch (e: any) {
    return json({ success: false, issue: e?.message });
  }    const resultData = await result.getStudentResult({ id: 138, examId: 5 });
    const validatedResult = await resultOutputSchema.safeParseAsync(resultData);
    if (!validatedResult.success || !resultData) {
      return json({ success: false, issue: validatedResult.error?.issues });
    }
};