import { generateContent } from "$lib/server/helpers/chat-helper";
import { workerPool } from "$lib/server/queue/pool";
import { json, type RequestHandler } from "@sveltejs/kit";
import { readFileSync } from "fs";
import { join } from "path";
import { result } from "$lib/server/service/result.service";
import { resultInputSchema } from "$lib/schema/result";
import { CredentialType } from "$lib/schema/chat-schema";
import { useAgent } from "$lib/server/service/agent.service";

export const GET: RequestHandler = async ({ url }) => {
  try {
    const tid = url.searchParams.get("taskId");
    if (tid) {
      const task = workerPool.getTaskStatus(tid);
      if (!task) {
        return json({ error: "Task not found" }, { status: 404 });
      }
      // If the task is done or error, we return the result but it will be deleted soon
      return json(task);
    }

    const filePath = join(process.cwd(), "static", "05_MB6a.jpeg");
    // Read the file as a buffer
    const fileBuffer = readFileSync(filePath);

    // Create a Blob from the buffer
    const fileBlob = new Blob([fileBuffer], { type: "image/jpeg" });

    const data = await result.getMappingData(1);
    const mapString = JSON.stringify(data);

    const provider = await useAgent().use(CredentialType.QWEN_CODE).geModelProvider();
    if (!provider) throw new Error("No provider found");

    const taskId = await workerPool.runTask({ type: "extract-data" }, async (msg) => {
      try {
        const content = await generateContent(fileBlob, provider, mapString);
        const parsedResult = JSON.parse(content.trim());
        const marks = resultInputSchema.parse(parsedResult);
        console.log(marks);
        return { success: true, data: marks };
      } catch (error: any) {
        console.error("Error extracting data:", error);
        return { success: false, error };
      }
    });

    return json({ success: true, taskId });
  } catch (error: any) {
    console.error("Error creating job:", error);
    return new Response(error.message, { status: 500 });
  }
};
