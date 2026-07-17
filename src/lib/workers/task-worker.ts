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

// AbortController per task — used by `runOcrDirect` so a `cancel`
// message can abort the in-flight `fetch` immediately.
const abortControllers = new Map<string, AbortController>();

// Per-task cancelled flag — checked at the top of each poll iteration
// for `ocr-batch` so the loop breaks without waiting for the next 3s
// poll cycle. Set by the `cancel` message handler.
const cancelledTasks = new Set<string>();

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
	cleanupTask(taskId);
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
	cleanupTask(taskId);
}

function postCancelled(
	taskId: string,
	partial?: { succeeded: number; failed: number; results: BatchExtractResult[] },
): void {
	emit({ type: "cancelled", taskId, partial });
	cleanupTask(taskId);
}

function cleanupTask(taskId: string): void {
	abortControllers.delete(taskId);
	cancelledTasks.delete(taskId);
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

	const terminalStatuses = new Set([
		"SUCCESS",
		"FAILED",
		"TIMEOUT_EXCEEDED",
		"CANCELLATION_REQUESTED",
		"CANCELLED",
	]);

	while (Date.now() - start < POLL_TIMEOUT_MS) {
		// Honour user-initiated cancel immediately — don't wait for the
		// next 3s poll cycle.
		if (cancelledTasks.has(taskId)) {
			await cancelBatchOnServer(jobId, tenant);
			postCancelled(taskId);
			return;
		}

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

		if (terminalStatuses.has(poll.status)) {
			break;
		}
	}

	// Cancel states short-circuit — don't try to finalize.
	if (lastStatus === "CANCELLATION_REQUESTED" || lastStatus === "CANCELLED") {
		postCancelled(taskId);
		return;
	}

	if (lastStatus !== "SUCCESS" && lastStatus !== "FAILED" && lastStatus !== "TIMEOUT_EXCEEDED") {
		// Local poll cap hit with no terminal status from Mistral. Cancel
		// the batch so Mistral stops charging, then surface the timeout.
		await cancelBatchOnServer(jobId, tenant);
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

/**
 * Fire-and-forget cancel of a running Mistral batch job. Called by the
 * local-timeout path so Mistral stops charging for the abandoned job,
 * and indirectly by the `cancel` message handler (via the
 * `cancelledTasks` flag check inside the poll loop).
 */
async function cancelBatchOnServer(jobId: string, tenant: SerializedTenant): Promise<void> {
	try {
		await fetch("/api/file/?action=cancel-batch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jobId, tenant }),
		});
	} catch {
		// best-effort — local timeout path is throwing anyway
	}
}

async function runOcrDirect(
	taskId: string,
	key: string,
	tenant: SerializedTenant,
): Promise<void> {
	postProgress(taskId, 0.1, "Reading file from workspace…");

	const controller = new AbortController();
	abortControllers.set(taskId, controller);

	const res = await fetch("/api/file/?action=ocr-direct", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ key, tenant }),
		signal: controller.signal,
	}).catch((err: unknown) => {
		if (err instanceof DOMException && err.name === "AbortError") {
			postCancelled(taskId);
			return null;
		}
		throw err;
	});

	if (!res) return; // cancelled

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`OCR direct failed: ${res.status} ${text}`);
	}

	postProgress(taskId, 0.95, "Persisting result…");

	await res.json();
	postCompleted(taskId, {
		succeeded: 1,
		failed: 0,
		results: [{ key, status: "success" }],
	});
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
			case "ocr-direct":
				await runOcrDirect(taskId, spec.key, spec.tenant);
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
	} else if (msg.type === "cancel") {
		handleCancel(msg.taskId);
	}
};

/**
 * Handle a `cancel` message from the main thread.
 *
 *   - For `ocr-batch` (running poll loop): sets the `cancelledTasks`
 *     flag. The next iteration of the poll loop in `runOcrBatch` checks
 *     this flag and short-circuits, calling `cancelBatchOnServer` to
 *     stop the Mistral job before posting `cancelled`.
 *   - For `ocr-direct` (in-flight `fetch`): aborts the AbortController
 *     stored in `abortControllers`. The fetch's promise rejects with
 *     `AbortError`; `runOcrDirect` catches this and posts `cancelled`.
 */
function handleCancel(taskId: string): void {
	cancelledTasks.add(taskId);
	const controller = abortControllers.get(taskId);
	if (controller) {
		controller.abort();
	}
}
