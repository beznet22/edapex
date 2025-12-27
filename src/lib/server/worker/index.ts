import { Worker } from "worker_threads";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export interface JobResult {
  jobId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
}

// Path to the email worker
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registry = {
  "send-email": join(__dirname, "jobs/email-job.ts"),
} as const;

export type JobType = keyof typeof registry;

export type JobPayload = {
  type: JobType;
  data: any;
};

export class JobWorker {
  static async runTask(payload: JobPayload, callback?: (result: JobResult) => void): Promise<JobResult> {
    const { type, data } = payload;
    return new Promise((resolve, reject) => {
      const jobId = crypto.randomUUID();

      const worker = new Worker(registry[type], {
        workerData: { data, jobId },
        execArgv: ["--experimental-transform-types"],
      });

      worker.on("message", (msg) => {
        if (msg.jobId === jobId) {
          if (callback) callback(msg);
          resolve(msg);
        }
      });

      worker.on("error", (err) => {
        if (callback) callback({ jobId, status: "error", error: err.message });
        reject(new Error(`Worker error: ${err.message}`));
      });

      worker.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          if (callback) callback({ jobId, status: "error", error: `Worker stopped with exit code ${code}` });
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}
