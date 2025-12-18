import { CredentialType, fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { useAgent } from "$lib/server/service/agent.service";
import { result } from "$lib/server/service/result.service";
import type { TaskData } from "$lib/types/chat-types";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";
import crypto from "crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { CACHE_DIR } from "$lib/constants";

export const POST: RequestHandler = async ({ request, locals, url }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  const tid = url.searchParams.get("taskId");
  if (tid) {
    const task = getTaskStatus(tid);
    if (!task) {
      return error(404, "Task not found");
    }
    return json(task);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return error(400, "No file uploaded");
    }

    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      console.error(errorMessage);
      return error(400, errorMessage);
    }

    const provider = await useAgent().use(CredentialType.QWEN_CODE).geModelProvider();
    if (!provider) throw new Error("No provider found");

    const mappingData = await result.getMappingData(user.staffId || 1);
    console.log("Mapping data: ", mappingData);
    const mapString = JSON.stringify(mappingData);

    const taskId = crypto.randomUUID();
    updateTaskStatus({ taskId, status: "queued" });
    // (async () => {
      try {
        updateTaskStatus({ taskId, status: "processing" });
        const content = await generateContent(validatedFile.data, provider, mapString);
        const parsedResult = JSON.parse(content.trim());
        const marks = resultInputSchema.parse(parsedResult);
        const res = await result.upsertStudentResult(marks, 1);
        if (!res.success) {
          updateTaskStatus({ taskId, status: "error", error: res.message });
        }

        // dummy long running task
        // await new Promise((resolve) => setTimeout(resolve, 5000));
        updateTaskStatus({ taskId, status: "done", data: {} });
      } catch (error: any) {
        console.error("Error extracting data:", error);
        updateTaskStatus({ taskId, status: "error", error: error.message });
      }
    // })();

    const task = getTaskStatus(taskId);
    deleteTask(taskId);
    return json(task);
  } catch (e) {
    console.error(e);
    return error(500, "Failed to upload file, try again");
  }
};

const taskStoreDir = join(CACHE_DIR, "tasks");

// Create the task store directory if it doesn't exist
try {
  // We'll create the directory when needed
} catch (error) {
  console.error("Failed to prepare task store directory:", error);
}

function ensureTaskStoreDir() {
  try {
    // Create the directory if it doesn't exist
    mkdirSync(taskStoreDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create task store directory:", error);
  }
}

function getTaskFilePath(taskId: string): string {
  return join(taskStoreDir, `${taskId}.json`);
}

function updateTaskStatus(taskData: TaskData): void {
  try {
    ensureTaskStoreDir();
    const filePath = getTaskFilePath(taskData.taskId);
    writeFileSync(filePath, JSON.stringify(taskData));
  } catch (error) {
    console.error(`Failed to update task status for ${taskData.taskId}:`, error);
  }
}

function getTaskStatusFromFile(taskId: string): TaskData | null {
  try {
    const filePath = getTaskFilePath(taskId);
    const data = readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function deleteTask(taskId: string): void {
  try {
    const filePath = getTaskFilePath(taskId);
    unlinkSync(filePath);
  } catch (error) {
    console.error(`Failed to delete task file for ${taskId}:`, error);
  }
}

function getTaskStatus(taskId: string): TaskData | null {
  const task = getTaskStatusFromFile(taskId);

  // If the task is done or error, delete it from the filesystem after retrieving it
  if (task && (task.status === "done" || task.status === "error")) {
    deleteTask(taskId);
  }

  return task;
}
