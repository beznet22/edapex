import { json, type RequestHandler } from "@sveltejs/kit";
import { resultRepo, studentRepo } from "$lib/server/repository";
import { assessment } from "$lib/server/service/assessment.service";
import { resultInputSchema } from "$lib/schema/result-input";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { env } from "$env/dynamic/private";
import { render } from "svelte/server";
import ResultTemplate from "$lib/components/template/ResultTemplate.svelte";
import { pageToHtml } from "$lib/server/helpers";
import { Worker } from "worker_threads";
import crypto from "crypto";

export const GET: RequestHandler = async ({ request, url }) => {
  try {

    // Resolve the path to the static directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const filePath = join(__dirname, "..", "..", "..", "static/extracted", "6a.json");
    const parsedResult = JSON.parse(readFileSync(filePath, "utf-8"));
    const marks = await resultInputSchema.parseAsync(parsedResult);
    const res = await assessment.upsertStudentResult(marks, 1);
    const resultData = await assessment.getStudentResult({ id: 20, examId: 5 });

    const props = { data: resultData };
    const { body, head } = render(ResultTemplate, { props });

    const html = pageToHtml(body, head);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });

    return json({});
  } catch (error: any) {
    console.error("Error creating job:", error);
    return new Response(error.message, { status: 500 });
  }
};

async function extractFromLocalFile(filePath: string) {
  // Read the file into a buffer
  const fileBuffer = readFileSync(filePath);

  // Prepare form-data using Web FormData + Blob
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), filePath.split("/").pop() || "file");
  form.append("output_format", "markdown");
  // form.append("json_options", "hierarchy_output");

  // Make request
  const response = await fetch("https://extraction-api.nanonets.com/api/v1/extract/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NANONETS_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Nanonets error ${response.status}: ${errText}`);
  }

  return response.json();
}
