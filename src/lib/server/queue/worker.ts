import { parentPort } from "worker_threads";
import { SMTPClient, type SMTPMessage, type SMTPResult } from "$lib/server/helpers/smtp";
import { jobHandlers } from "./jobs/handler";

interface WorkerMessage {
  success: boolean;
  jobId: string | number;
  result?: SMTPResult | any;
  error?: string;
}

// Process the job based on payload
async function processJob(jobId: number | string, payload: any): Promise<void> {
  try {
    if (!payload || typeof payload !== "object" || !payload.type) {
      throw new Error("Invalid job payload: missing type field");
    }

    const { type } = payload;
    const handler = jobHandlers[type];
    if (!handler) {
      throw new Error(`No handler found for job type: ${type}`);
    }

    // Execute the handler for this job type
    const result = await handler(payload);
    const successMsg: WorkerMessage = {
      success: true,
      jobId,
      result,
    };

    if (parentPort) {
      parentPort.postMessage(successMsg);
    }
  } catch (error) {
    const errorMsg: WorkerMessage = {
      success: false,
      jobId,
      error: error instanceof Error ? error.message : String(error),
    };

    if (parentPort) {
      parentPort.postMessage(errorMsg);
    }
  }
}

// Listen for messages from the main thread
if (parentPort) {
  parentPort.on("message", async (data) => {
    const { jobId, payload } = data;
    await processJob(jobId, payload);
  });

  // Handle any errors in the worker
  parentPort.on("error", (err) => {
    console.error("Worker error:", err);
  });
}
