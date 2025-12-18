import { generateContent } from "$lib/server/helpers/chat-helper";
import { json, type RequestHandler } from "@sveltejs/kit";
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { result } from "$lib/server/service/result.service";
import { resultInputSchema } from "$lib/schema/result";
import { CredentialType } from "$lib/schema/chat-schema";
import { useAgent } from "$lib/server/service/agent.service";

interface TaskData {
  status: "queued" | "processing" | "done" | "error";
  data?: any;
  error?: string;
}

const taskStoreDir = join(process.cwd(), "cache", "tasks");

// Create the task store directory if it doesn't exist
try {
  // We'll create the directory when needed
} catch (error) {
  console.error("Failed to prepare task store directory:", error);
}

function ensureTaskStoreDir() {
  try {
    // Create the directory if it doesn't exist
    const { mkdirSync } = require("fs");
    mkdirSync(taskStoreDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create task store directory:", error);
  }
}

function getTaskFilePath(taskId: string): string {
  return join(taskStoreDir, `${taskId}.json`);
}

function updateTaskStatus(taskId: string, taskData: TaskData): void {
  try {
    ensureTaskStoreDir();
    const filePath = getTaskFilePath(taskId);
    const { writeFileSync } = require("fs");
    writeFileSync(filePath, JSON.stringify(taskData));
  } catch (error) {
    console.error(`Failed to update task status for ${taskId}:`, error);
  }
}

function getTaskStatusFromFile(taskId: string): TaskData | null {
  try {
    const filePath = getTaskFilePath(taskId);
    const { readFileSync } = require("fs");
    const data = readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

function deleteTask(taskId: string): void {
  try {
    const filePath = getTaskFilePath(taskId);
    const { unlinkSync } = require("fs");
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

export const GET: RequestHandler = async ({ url }) => {
  try {
    const tid = url.searchParams.get("taskId");
    if (tid) {
      const task = getTaskStatus(tid);
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

    // Generate a unique task ID
    const taskId = crypto.randomUUID();
    
    // Initialize task status as queued
    updateTaskStatus(taskId, { status: "queued" });

    // Start the long-running task in the background
    (async () => {
      try {
        // Update status to processing
        updateTaskStatus(taskId, { status: "processing" });

        // const content = await generateContent(fileBlob, provider, mapString);
        // const parsedResult = JSON.parse(content.trim());
        // const marks = resultInputSchema.parse(parsedResult);

        // dummy long running task
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Update status to done with results
        updateTaskStatus(taskId, { 
          status: "done", 
          data: { success: true, data: "Hello World" } 
        });
      } catch (error: any) {
        console.error("Error extracting data:", error);
        // Update status to error
        updateTaskStatus(taskId, { 
          status: "error", 
          error: error.message 
        });
      }
    })();

    return json({ success: true, taskId });
  } catch (error: any) {
    console.error("Error creating job:", error);
    return new Response(error.message, { status: 500 });
  }
};
