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
    // const filePath = `${process.cwd()}/static/extracted/parsed.json`;
    // const data = readFileSync(filePath, "utf-8");
    // const parsed = JSON.parse(data);
    // const validated = await resultInputSchema.parseAsync(parsed)

    result.publishResult({ studentIds: [144], examId: 5 }).catch((e) => {
      console.error(`Failed to publish result: ${e}`);
    });

    return json({ success: true });
  } catch (e: any) {
    console.error(`Failed to publish result: ${e}`);
    return error(500, e.message);
  }
};