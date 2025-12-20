import { Worker } from "worker_threads";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

interface TaskResult {
  jobId: string;
  status: "success" | "error";
  result?: any;
  error?: string;
}

export class SingleTaskWorker {
  static async runTask(workerPath: string, taskData: any): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const taskId = crypto.randomUUID();
      
      const worker = new Worker(workerPath, {
        workerData: { ...taskData, taskId }
      });

      worker.on("message", (msg) => {
        if (msg.jobId === taskId) {
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
