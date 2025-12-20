import { Worker } from "worker_threads";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import os from "os";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync } from "fs";

// Type for augmented Worker
interface PooledWorker extends Worker {
  busy: boolean;
  _resolve?: (value: any) => void;
  _reject?: (reason?: any) => void;
}

interface TaskData {
  status: "queued" | "processing" | "done" | "error";
  data?: any;
  error?: string;
}

export class WorkerPool {
  private workers: PooledWorker[] = [];
  private queue: any[] = [];
  private readonly taskStoreDir: string;
  private readonly poolSize: number;

  constructor(private workerPath: string) {
    this.poolSize = Math.max(1, os.cpus().length - 1);
    this.taskStoreDir = join(process.cwd(), "cache", "tasks");
    this.ensureTaskStoreDir();
    this.initializeWorkers();
  }

  private ensureTaskStoreDir() {
    try {
      mkdirSync(this.taskStoreDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create task store directory:", error);
    }
  }

  public initializeWorkers() {
    console.log("Initializing workers...");
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerPath) as PooledWorker;
      worker.busy = false;

      worker.on("message", async (msg) => {
        worker.busy = false;
        // Find the task that was being processed by this worker and update its status
        if (this.queue.length > 0) {
          const taskIndex = this.queue.findIndex((item) => item.workerId === worker.threadId);
          if (taskIndex !== -1) {
            const task = this.queue[taskIndex];
            
            // Execute the callback asynchronously without blocking the message handler
            // This allows heavy operations in the callback to not block the worker
            (async () => {
              try {
                await task.resolve(msg);
                // Update task status after callback completes
                // Note: If the callback already updated the status, we might not need this
              } catch (error) {
                console.error("Error in task callback:", error);
                this.updateTaskStatus(task.data.taskId, { status: "error", error: String(error) });
              } finally {
                // Remove the task from the queue as it's completed
                // Find the task again in case the queue has changed
                const finalTaskIndex = this.queue.findIndex((item) => item.workerId === worker.threadId);
                if (finalTaskIndex !== -1) {
                  this.queue.splice(finalTaskIndex, 1);
                }
              }
            })();
          }
        }
        worker._resolve?.(msg);
        worker._resolve = undefined;
        worker._reject = undefined;
        await this.runNext();
      });

      worker.on("error", (err) => {
        worker.busy = false;
        // Find the task that was being processed by this worker and update its status
        if (this.queue.length > 0) {
          const taskIndex = this.queue.findIndex((item) => item.workerId === worker.threadId);
          if (taskIndex !== -1) {
            const task = this.queue[taskIndex];
            this.updateTaskStatus(task.data.taskId, { status: "error", error: String(err) });
            // Remove the task from the queue as it's completed (with error)
            this.queue.splice(taskIndex, 1);
          }
        }
        worker._reject?.(err);
        worker._resolve = undefined;
        worker._reject = undefined;
        this.runNext();
      });

      this.workers.push(worker);
    }
  }

  private async runNext() {
    const free = this.workers.find((w) => !w.busy);
    if (!free) return;

    // Find the first task that isn't already assigned to a worker
    const nextIndex = this.queue.findIndex((item) => !item.workerId);
    if (nextIndex === -1) return;

    const next = this.queue[nextIndex];

    free.busy = true;
    // Assign the worker to this task so we can identify it later
    next.workerId = free.threadId;

    // mark task as processing
    const { taskId } = next.data;
    this.updateTaskStatus(taskId, { status: "processing" });

    free._resolve = await next.resolve;
    free._reject = next.reject;
    free.postMessage({ jobId: taskId, payload: next.data.payload });
  }

  private getTaskFilePath(taskId: string): string {
    return join(this.taskStoreDir, `${taskId}.json`);
  }

  public updateTaskStatus(taskId: string, taskData: TaskData): void {
    try {
      const filePath = this.getTaskFilePath(taskId);
      writeFileSync(filePath, JSON.stringify(taskData));
    } catch (error) {
      console.error(`Failed to update task status for ${taskId}:`, error);
    }
  }

  private deleteTask(taskId: string): void {
    try {
      const filePath = this.getTaskFilePath(taskId);
      unlinkSync(filePath);
    } catch (error) {
      console.error(`Failed to delete task file for ${taskId}:`, error);
    }
  }

  private getTaskStatusFromFile(taskId: string): TaskData | null {
    try {
      const filePath = this.getTaskFilePath(taskId);
      const data = readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private listAllTaskIds(): string[] {
    try {
      const files = readdirSync(this.taskStoreDir);
      return files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)); // Remove '.json' extension
    } catch (error) {
      return [];
    }
  }

  public async runTask(
    payload: any,
    onMessageCallback?: (msg: any) => Promise<{ success: boolean; data?: any; error?: string }>
  ): Promise<string> {
    const taskId = crypto.randomUUID();

    // Initial task state
    this.updateTaskStatus(taskId, { status: "queued" });
    const data = { taskId, payload };

    this.queue.push({
      data,
      resolve: async (msg: any) => {
        // Call the provided callback if it exists
        if (onMessageCallback) {
          const result = await onMessageCallback(msg);
          if (!result.success) {
            this.updateTaskStatus(taskId, { status: "error", error: result.error });
            return;
          }
          this.updateTaskStatus(taskId, { status: "done", data: result.data });
        }
      },
      reject: (err: any) => {
        this.updateTaskStatus(taskId, { status: "error", error: String(err) });
      },
      taskStore: this, // Pass the instance itself to handle updates
    });

    await this.runNext();

    return taskId;
  }

  public getTaskStatus(taskId: string): TaskData | null {
    const task = this.getTaskStatusFromFile(taskId);

    // If the task is done or error, delete it from the filesystem after retrieving it
    if (task && (task.status === "done" || task.status === "error")) {
      this.deleteTask(taskId);
    }

    return task;
  }

  public getAllTasks(): Map<string, TaskData> {
    const allTasks = new Map<string, TaskData>();
    const taskIds = this.listAllTaskIds();

    for (const taskId of taskIds) {
      const taskData = this.getTaskStatusFromFile(taskId);
      if (taskData) {
        allTasks.set(taskId, taskData);
      }
    }

    return allTasks;
  }

  public destroy() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.queue = [];
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = join(__dirname, "worker.js");

export const workerPool = new WorkerPool(workerPath);
