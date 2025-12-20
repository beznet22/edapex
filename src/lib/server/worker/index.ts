import { Worker } from "worker_threads";
import { join } from "path";
import { fileURLToPath } from "url";
import { jobRepo } from "$lib/server/repository";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

// Define the WorkerMessage type according to your worker's message structure
type WorkerMessage = {
  success: boolean;
  jobId: string | number;
  error?: string;
};

export class QueueWorker {
  private worker: Worker;
  private workerPath: string;
  private polling: boolean;
  private pollInterval: number;
  private staleSeconds: number;
  private maxAttempts: number;
  private backoffBase: number;

  constructor() {
    this.workerPath = this.resolvePath();
    this.worker = new Worker(this.workerPath);

    this.polling = false;
    this.pollInterval = 1000; // 1 second
    this.staleSeconds = 60;
    this.maxAttempts = 3;
    this.backoffBase = 60;
  }

  private resolvePath() {
    const path = join(process.cwd(), "build", "lib/server/queue/worker.js");
    if (existsSync(path)) return path;
    return join(__dirname, "worker.js");
  }

  async run(jobId: number, execute: () => Promise<void>) {
    const job = await jobRepo.getJobById(jobId);
    if (!job) return;

    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(this.workerPath);

      const handler = (msg: WorkerMessage) => {
        if (msg.jobId === job.id) {
          if (msg.success) resolve();
          else reject(new Error(msg.error || "Unknown"));
          worker.removeListener("message", handler);
        }
      };
      worker.on("message", handler);

      const errorHandler = (err: Error) => {
        reject(err);
        worker.removeListener("error", errorHandler);
      };
      worker.on("error", errorHandler);

      // Set max listeners to prevent memory leaks
      worker.setMaxListeners(20);
      // Fire-and-forget: we do NOT await message
      worker.unref(); // <- VERY IMPORTANT

     const code = execute.toString();

      worker.postMessage({ jobId: job.id, code });
    });
  }

  async start() {
    if (this.polling) return;
    this.polling = true;
    await this.pollOnce();
  }

  async stop() {
    this.polling = false;
    this.worker.terminate();
  }

  async pollOnce() {
    const job = await jobRepo.pickAndClaimJob(this.staleSeconds);
    if (!job) {
      // If no job is found, wait before polling again to avoid excessive polling
      if (this.polling) {
        setTimeout(() => this.pollOnce(), this.pollInterval);
      }
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(job.payload);
    } catch {
      payload = job.payload;
    }

    // Verify that the payload has the required structure
    if (!payload || typeof payload !== "object" || !payload.type) {
      console.error(`Invalid job payload for job ID ${job.id}:`, job.payload);
      // Delete the invalid job to prevent it from being processed repeatedly
      await jobRepo.deleteJob(job.id);

      if (this.polling) {
        setTimeout(() => this.pollOnce(), this.pollInterval);
      }
      return;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const handler = (msg: WorkerMessage) => {
        if (msg.jobId === job.id) {
          if (msg.success) resolve();
          else reject(new Error(msg.error || "Unknown"));
          this.worker.removeListener("message", handler);
        }
      };
      this.worker.on("message", handler);

      // Handle worker errors
      const errorHandler = (err: Error) => {
        reject(err);
        this.worker.removeListener("error", errorHandler);
      };
      this.worker.on("error", errorHandler);

      // Set max listeners to prevent memory leaks
      this.worker.setMaxListeners(20);

      this.worker.postMessage({ jobId: job.id, payload });
    });

    try {
      await promise;
      await jobRepo.deleteJob(job.id);
    } catch (err: any) {
      const attempts = job.attempts ?? 1;
      if (attempts >= this.maxAttempts) {
        await jobRepo.insertFailedJob("node", job.queue, job.payload, String(err));
        await jobRepo.deleteJob(job.id);
      } else {
        const backoff = Math.pow(2, attempts - 1) * this.backoffBase;
        await jobRepo.requeueJob(job.id, backoff);
      }
    } finally {
      if (this.polling) {
        setTimeout(() => this.pollOnce(), this.pollInterval);
      }
    }
  }
}

export function startQueueWorker() {
  const worker = new QueueWorker();
  worker.start();
}
