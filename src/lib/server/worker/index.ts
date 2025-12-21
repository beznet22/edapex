import { Worker } from "worker_threads";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

interface TaskResult {
  jobId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
}

// Path to the email worker
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registry = {
  "send-email": join(__dirname, "jobs/email-job.js"),
  "generate-pdf": join(__dirname, "jobs/pdf-job.js"),
} as const;

export type JobType = keyof typeof registry;

export type Payload = {
  type: JobType;
  data: any;
};

export class JobWorker {
  static async runTask(payload: Payload): Promise<TaskResult> {
    const { type } = payload;
    return new Promise((resolve, reject) => {
      const jobId = crypto.randomUUID();

      const worker = new Worker(registry[type], {
        workerData: payload,
      });

      worker.on("message", (msg) => {
        if (msg.jobId === jobId) {
          if (msg.status === "success" || msg.status === "error") {
            resolve(msg);
          }
        }
      });

      worker.on("error", (err) => {
        reject(new Error(`Worker error: ${err.message}`));
      });

      worker.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}
