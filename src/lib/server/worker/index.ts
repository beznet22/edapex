import { Worker } from "worker_threads";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { dev } from "$app/environment";

export interface JobResult {
  jobId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
}

// Path to the email worker
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In dev: use __dirname relative path with .ts extension
// In prod: use absolute path from cwd to build/lib/server/worker/jobs with .js extension
const getWorkerPath = (jobName: string) => {
  if (dev) {
    return join(__dirname, `jobs/${jobName}.ts`);
  }
  // Production: workers are compiled to build/lib/server/worker/jobs/
  return join(process.cwd(), `build/lib/server/worker/jobs/${jobName}.js`);
};

const registry = {
  "send-email": getWorkerPath("email-job"),
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

      // In dev, use --experimental-transform-types to run .ts directly
      const execArgv = dev ? ["--experimental-transform-types"] : [];

      const worker = new Worker(registry[type], {
        workerData: { data, jobId },
        execArgv,
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
