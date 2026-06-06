/**
 * Task Worker — EdApex
 *
 * Generic web worker that runs long-lived background tasks without
 * blocking the main thread. The main thread (see `backgroundTasks.svelte.ts`)
 * owns the worker instance, posts `run` messages with a `TaskSpec`, and
 * receives typed `TaskEvent` messages back.
 *
 * The worker itself does NOT import server-side code (no `fs`, no Drizzle,
 * no `env`). It talks to the server exclusively via `fetch`, which is
 * available in any modern browser worker context. This keeps the worker
 * portable and avoids the Vite-bundle complexity of trying to import
 * Node-only modules into a worker chunk.
 *
 * To add a new task kind:
 *   1. Extend `TaskSpec` in `$lib/types/background-tasks.ts`
 *   2. Add a `case` to the `runTask` switch below
 *   3. Optionally add a server endpoint in `/api/file` or `/api/chat` to
 *      own the heavy lifting
 */

/// <reference lib="webworker" />

import type {
  TaskEvent,
  TaskSpec,
  WorkerInbound,
  BatchExtractResult,
  SerializedTenant,
} from "$lib/types/background-tasks";

declare const self: DedicatedWorkerGlobalScope;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function emit(event: TaskEvent): void {
  self.postMessage(event);
}

function postStarted(taskId: string): void {
  emit({ type: "started", taskId });
}

function postProgress(taskId: string, progress: number, message: string): void {
  emit({ type: "progress", taskId, progress, message });
}

function postCompleted(
  taskId: string,
  result: { succeeded: number; failed: number; results: BatchExtractResult[] },
): void {
  emit({ type: "completed", taskId, result });
}

function postFailed(
  taskId: string,
  error: string,
  partial?: { succeeded: number; failed: number; results: BatchExtractResult[] },
): void {
  if (partial) {
    emit({ type: "failed", taskId, error, partial });
  } else {
    emit({ type: "failed", taskId, error });
  }
}

async function runOcrBatch(
  taskId: string,
  keys: string[],
  tenant: SerializedTenant,
): Promise<void> {
  postProgress(taskId, 0, `Starting batch OCR for ${keys.length} file(s)…`);

  const startRes = await fetch("/api/file/?action=batch-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys, tenant }),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Failed to start batch: ${startRes.status} ${text}`);
  }

  const { jobId, total } = (await startRes.json()) as { jobId: string; total: number };

  postProgress(taskId, 0, `Job ${jobId} queued (${total} request${total === 1 ? "" : "s"})…`);

  const start = Date.now();
  let lastSucceeded = 0;
  let lastFailed = 0;
  let lastStatus: string = "QUEUED";

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `/api/file/?action=batch-status&jobId=${encodeURIComponent(jobId)}`,
    );
    if (!pollRes.ok) {
      throw new Error(`Poll failed: ${pollRes.status}`);
    }
    const poll = (await pollRes.json()) as {
      status: string;
      succeeded: number;
      failed: number;
      total: number;
      outputFileId?: string;
    };

    lastStatus = poll.status;
    lastSucceeded = poll.succeeded;
    lastFailed = poll.failed;

    const settled = poll.succeeded + poll.failed;
    const progress = poll.total > 0 ? settled / poll.total : 0;

    postProgress(taskId, progress, `${poll.status} — ${settled}/${poll.total} (${poll.succeeded} ok, ${poll.failed} failed)`);

    if (poll.status === "SUCCESS" || poll.status === "FAILED" || poll.status === "CANCELLED" || poll.status === "TIMED_OUT") {
      break;
    }
  }

  if (lastStatus !== "SUCCESS" && lastStatus !== "FAILED") {
    throw new Error(`Batch timed out after ${POLL_TIMEOUT_MS / 1000}s (last status: ${lastStatus})`);
  }

  postProgress(taskId, 0.95, "Downloading and persisting results…");

  const finalizeRes = await fetch("/api/file/?action=batch-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, keys, tenant }),
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`Finalize failed: ${finalizeRes.status} ${text}`);
  }

  const { results } = (await finalizeRes.json()) as { results: BatchExtractResult[] };

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  if (lastStatus === "FAILED" || failed > 0) {
    postFailed(taskId, `${succeeded} of ${results.length} completed`, {
      succeeded,
      failed,
      results,
    });
    return;
  }

  postCompleted(taskId, { succeeded, failed, results });
}

async function runOcrSingle(
  taskId: string,
  key: string,
  tenant: SerializedTenant,
): Promise<void> {
  await runOcrBatch(taskId, [key], tenant);
}

async function runTask(taskId: string, spec: TaskSpec): Promise<void> {
  postStarted(taskId);
  try {
    switch (spec.kind) {
      case "ocr-batch":
        await runOcrBatch(taskId, spec.keys, spec.tenant);
        break;
      case "ocr-single":
        await runOcrSingle(taskId, spec.key, spec.tenant);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postFailed(taskId, message);
  }
}

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  if (msg.type === "run") {
    void runTask(msg.taskId, msg.spec);
  }
};
