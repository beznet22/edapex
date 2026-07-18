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
  UploadFileState,
} from "$lib/types/background-tasks";
import TaskWorker from "$lib/workers/task-worker.ts?worker";

class BackgroundTasksStore {
  tasks = $state<Task[]>([]);

  #worker: Worker | null = null;
  #workerReady: Promise<void> | null = null;
  #tasksById = new Map<string, Task>();
  #abortControllers = new Map<string, AbortController>();

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
      worker.onmessage = (e: MessageEvent<TaskEvent>) => {
        this.#handleEvent(e.data);
      };
      worker.onerror = (e: ErrorEvent) => {
        console.error("[bg] worker error", e);
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

  /**
   * Returns (and lazily creates) an AbortController for the given task
   * id. Used by the `ocr-direct` worker handler so a `cancel` message
   * can abort the in-flight `fetch` immediately.
   */
  getAbortController(taskId: string): AbortController {
    let controller = this.#abortControllers.get(taskId);
    if (!controller) {
      controller = new AbortController();
      this.#abortControllers.set(taskId, controller);
    }
    return controller;
  }

	#handleEvent(event: TaskEvent): void {
		// Side effects before state update
		const taskIdx = this.tasks.findIndex((t) => t.id === event.taskId);
		if (taskIdx === -1) {
			console.warn("[bg] event orphaned — no task for", event.taskId.slice(0, 8), event.type);
			return;
		}
		if (event.type === "cancelled" || event.type === "completed" || event.type === "failed") {
			this.#abortControllers.delete(event.taskId);
		}
		if (event.type === "cancelled") {
			const controller = this.#abortControllers.get(event.taskId);
			if (controller) controller.abort();
		}

		// Immutable state update through $state proxy
		this.tasks = this.tasks.map((t) => {
			if (t.id !== event.taskId) return t;

			switch (event.type) {
				case "started":
					return { ...t, status: "running" as const, progress: 0, message: "Running…", startedAt: Date.now() };
				case "progress":
					return { ...t, status: "running" as const, progress: event.progress, message: event.message };
				case "file-update":
					return { ...t, files: event.files };
				case "phase-change":
					return { ...t, phase: event.phase };
				case "completed":
					return {
						...t,
						status: "completed" as const,
						progress: 1,
						message: `${event.result.succeeded} of ${event.result.results.length} completed`,
						result: event.result,
						completedAt: Date.now(),
					};
				case "failed":
					return {
						...t,
						status: "failed" as const,
						error: event.error,
						message: event.partial
							? `${event.partial.succeeded} of ${event.partial.results.length} completed`
							: event.error,
						result: event.partial ?? t.result,
						completedAt: Date.now(),
					};
				case "cancelled":
					return {
						...t,
						status: "cancelled" as const,
						message: event.partial
							? `Cancelled — ${event.partial.succeeded} of ${event.partial.results.length} completed`
							: "Cancelled by user",
						result: event.partial ?? t.result,
						completedAt: Date.now(),
					};
				default:
					return t;
			}
		});

		// Keep #tasksById in sync for downstream consumers.  Strip any
		// $state proxy wrapper so the object survives postMessage on retry.
		const updated = this.tasks.find((t) => t.id === event.taskId);
		if (updated) this.#tasksById.set(event.taskId, { ...updated });
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
      if (!worker) {
        console.error("[bg] no worker after ensureWorker resolved");
        return;
      }
      const message: WorkerInbound = { type: "run", taskId: id, spec };
      worker.postMessage(message);
    });

    return id;
  }

  /**
   * Request cancellation of a running or queued task. Posts a `cancel`
   * message to the worker, which:
   *   - For `ocr-batch` (Mistral batch): sets a per-task `cancelled`
   *     flag and fires `POST /api/file?action=cancel-batch` so Mistral
   *     stops charging for the job.
   *   - For `ocr-direct`: calls `controller.abort()` on the AbortController
   *     stored in `#abortControllers` so the in-flight `fetch` aborts
   *     immediately. The server's `?action=ocr-direct` handler
   *     returns early.
   * The worker eventually posts a `cancelled` `TaskEvent` which sets
   * `task.status = "cancelled"` and `task.completedAt = Date.now()`.
   */
  cancelTask(id: string): void {
    const worker = this.#worker;
    if (!worker) {
      console.warn("[bg] cancelTask — no worker");
      return;
    }
    const message: WorkerInbound = { type: "cancel", taskId: id };
    worker.postMessage(message);
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
    this.#abortControllers.delete(id);
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  clearCompleted(): void {
    const toRemove = this.tasks.filter(
      (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled"
    );
    for (const t of toRemove) {
      this.#tasksById.delete(t.id);
      this.#abortControllers.delete(t.id);
    }
    this.tasks = this.tasks.filter(
      (t) => t.status !== "completed" && t.status !== "failed" && t.status !== "cancelled"
    );
  }

  get activeCount(): number {
    return this.tasks.filter(
      (t) => t.status === "running" || t.status === "queued"
    ).length;
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
    className: t.className,
    sectionName: t.sectionName,
    academicYearTitle: t.academicYearTitle,
  };
}
