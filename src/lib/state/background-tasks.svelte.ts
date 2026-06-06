/**
 * Background Tasks Store — EdApex
 *
 * Main-thread owner of the `task-worker.ts` web worker. Exposes a Svelte 5
 * reactive `tasks` array that any component can read to render progress
 * (e.g. the chat header activity indicator).
 *
 * Lifecycle:
 *   - `runTask(spec)` spawns (or reuses) the worker, posts a `run` message,
 *     and returns a stable `taskId` for the caller to track.
 *   - Worker events (`started`, `progress`, `completed`, `failed`) update
 *     the matching task in-place so Svelte 5 reactivity triggers.
 *   - `dismissTask(id)` removes a task from the list (regardless of status).
 *   - `clearCompleted()` bulk-removes tasks in `completed` or `failed` state.
 *   - `retryTask(id)` re-runs a `failed` task with the same spec. For
 *     partial failures (`partial` present), it re-runs ONLY the failed keys.
 *
 * Singleton: exactly one worker instance per browser tab. Multiple `runTask`
 * calls share the same worker; the worker handles them sequentially.
 */
import { browser } from "$app/environment";
import type {
  Task,
  TaskEvent,
  TaskSpec,
  WorkerInbound,
  SerializedTenant,
  BatchExtractResult,
} from "$lib/types/background-tasks";
import TaskWorker from "$lib/workers/task-worker.ts?worker";

class BackgroundTasksStore {
  tasks = $state<Task[]>([]);

  #worker: Worker | null = null;
  #workerReady: Promise<void> | null = null;
  #tasksById = new Map<string, Task>();

  /**
   * Lazy-initialise the worker on first use. Returns a promise that
   * resolves when the worker is ready to receive messages.
   */
  #ensureWorker(): Promise<void> {
    if (this.#workerReady) return this.#workerReady;
    this.#workerReady = new Promise<void>((resolve) => {
      if (!browser) {
        resolve();
        return;
      }
      const worker: Worker = new TaskWorker();
      worker.onmessage = (e: MessageEvent<TaskEvent>) => this.#handleEvent(e.data);
      worker.onerror = (e: ErrorEvent) => {
        console.error("[background-tasks] worker error", e);
        // Mark all running tasks as failed
        for (const task of this.tasks) {
          if (task.status === "running" || task.status === "queued") {
            task.status = "failed";
            task.error = "Worker crashed";
            task.completedAt = Date.now();
          }
        }
        this.tasks = [...this.tasks];
      };
      this.#worker = worker;
      resolve();
    });
    return this.#workerReady;
  }

  #handleEvent(event: TaskEvent): void {
    const task = this.#tasksById.get(event.taskId);
    if (!task) return;

    switch (event.type) {
      case "started":
        task.status = "running";
        task.progress = 0;
        task.message = "Running…";
        task.startedAt = Date.now();
        break;
      case "progress":
        task.status = "running";
        task.progress = event.progress;
        task.message = event.message;
        break;
      case "completed":
        task.status = "completed";
        task.progress = 1;
        task.message = `${event.result.succeeded} of ${event.result.results.length} completed`;
        task.result = event.result;
        task.completedAt = Date.now();
        break;
      case "failed":
        task.status = "failed";
        task.error = event.error;
        if (event.partial) {
          task.result = event.partial;
          task.message = `${event.partial.succeeded} of ${event.partial.results.length} completed`;
        } else {
          task.message = event.error;
        }
        task.completedAt = Date.now();
        break;
    }

    this.tasks = [...this.tasks];
  }

  /**
   * Spawn a background task. Returns the `taskId` synchronously; updates
   * flow in via `tasks` reactivity. Safe to call from any component.
   */
  runTask(spec: TaskSpec): string {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      spec,
      status: "queued",
      progress: 0,
      message: "Queued…",
      startedAt: Date.now(),
    };
    this.#tasksById.set(id, task);
    this.tasks = [...this.tasks, task];

    void this.#ensureWorker().then(() => {
      const worker = this.#worker;
      if (!worker) return;
      const message: WorkerInbound = { type: "run", taskId: id, spec };
      worker.postMessage(message);
    });

    return id;
  }

  /**
   * Re-run a failed task. If the task has `partial` results, only the
   * failed keys are re-submitted. Otherwise, the entire spec is re-run.
   */
  retryTask(id: string): void {
    const original = this.#tasksById.get(id);
    if (!original) return;

    const partial = original.result;
    if (partial && original.spec.kind === "ocr-batch") {
      const failedKeys = partial.results.filter((r) => r.status === "error").map((r) => r.key);
      if (failedKeys.length === 0) {
        this.dismissTask(id);
        return;
      }
      const nextSpec: TaskSpec = { ...original.spec, keys: failedKeys };
      this.dismissTask(id);
      this.runTask(nextSpec);
      return;
    }

    this.dismissTask(id);
    this.runTask(original.spec);
  }

  dismissTask(id: string): void {
    this.#tasksById.delete(id);
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  clearCompleted(): void {
    const toRemove = this.tasks.filter((t) => t.status === "completed" || t.status === "failed");
    for (const t of toRemove) this.#tasksById.delete(t.id);
    this.tasks = this.tasks.filter((t) => t.status !== "completed" && t.status !== "failed");
  }

  get activeCount(): number {
    return this.tasks.filter((t) => t.status === "running" || t.status === "queued").length;
  }
}

export const backgroundTasks = new BackgroundTasksStore();

/**
 * Helper for callers that need a `SerializedTenant` from a richer
 * `TenantContext` (typically `locals.tenant` on the server). Mirrors the
 * shape sent through `postMessage` — plain JSON-serialisable values only.
 */
export function serializeTenant(t: SerializedTenant): SerializedTenant {
  return {
    schoolId: t.schoolId,
    userId: t.userId,
    designationId: t.designationId,
    staffId: t.staffId,
    classId: t.classId,
    sectionId: t.sectionId,
    examTypeId: t.examTypeId,
    academicId: t.academicId,
  };
}
