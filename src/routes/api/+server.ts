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

    const { studentId, examTypeId } = validated.studentData;
    if (!studentId || !examTypeId) return error(400, "Invalid student or exam type ID");

    // Background the publication process
    result.publishResult({ studentIds: [studentId], examId: examTypeId })
      .catch(e => console.error("Background Result Publication Failed:", e));

    return json({ success: true, message: "Result publication started in the background" });
  } catch (e: any) {
    return error(500, e.message);
  }
};