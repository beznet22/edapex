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
	UploadFileState,
} from "$lib/types/background-tasks";
import { compressImage, filenameForMime } from "$lib/compression.utils";

declare const self: DedicatedWorkerGlobalScope;

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const UPLOAD_BATCH_SIZE = 3;
const OCR_BATCH_SIZE = 5;

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

	const ocrResult = await res.json() as { manifestStatus?: string };
	postCompleted(taskId, {
		succeeded: 1,
		failed: 0,
		results: [{ key, status: "success", manifestStatus: ocrResult.manifestStatus ?? 'Extracted' }],
	});
}

async function fetchWithTimeout(
	url: string,
	options: RequestInit & { signal?: AbortSignal },
	timeoutMs: number,
): Promise<Response> {
	let timeoutId: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
		}, timeoutMs);
	});
	try {
		return await Promise.race([fetch(url, options), timeoutPromise]);
	} finally {
		clearTimeout(timeoutId!);
	}
}

async function runFilePipeline(
	taskId: string,
	files: Array<{ file: File; name: string }>,
	tenant: SerializedTenant,
	prefix: string,
	examTypeId: number,
): Promise<void> {
	const states: UploadFileState[] = files.map((f) => ({
		key: "",
		name: f.name,
		status: "compressing",
		source: "upload",
	}));

	function emitFiles(): void {
		emit({ type: "file-update", taskId, files: states.map((s) => ({ ...s })) });
	}

	const abortController = new AbortController();
	abortControllers.set(taskId, abortController);

	// ── Phase 1: Upload pool ─────────────────────────────────────────────────
	emit({ type: "phase-change", taskId, phase: "upload" });
	postProgress(taskId, 0, `Uploading ${files.length} file(s)…`);

	const uploadedKeys: string[] = [];
	let uploadIdx = 0;

	async function uploadWorker(): Promise<void> {
		while (true) {
			if (cancelledTasks.has(taskId)) return;
			const idx = uploadIdx++;
			if (idx >= files.length) return;
			const f = files[idx];

			try {
				states[idx] = { ...states[idx], status: "compressing" };
				emitFiles();

				const result = await compressImage(f.file);

				states[idx] = {
					...states[idx],
					status: "uploading",
					compressedSize: result.file.size,
					originalSize: f.file.size,
				};
				emitFiles();

				const filename = filenameForMime(f.name, result.file.type);
				const path = prefix + filename;

				const res = await fetchWithTimeout(
					`/api/file/${path}?examTypeId=${examTypeId}`,
					{ method: "PUT", body: result.file, signal: abortController.signal },
					60000,
				);

				if (!res.ok) {
					let msg = `HTTP ${res.status}`;
					try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* skip */ }
					throw new Error(msg);
				}

				states[idx] = { ...states[idx], status: "completed", key: path };
				uploadedKeys.push(path);
				emitFiles();
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") {
					return; // task cancelled — stop this worker
				}
				const msg = err instanceof Error ? err.message : String(err);
				states[idx] = {
					...states[idx],
					status: "error",
					error: msg,
				};
				emitFiles();
			}
		}
	}

	const uploadWorkers = Array.from(
		{ length: Math.min(UPLOAD_BATCH_SIZE, files.length) },
		() => uploadWorker(),
	);
	await Promise.all(uploadWorkers);

	if (cancelledTasks.has(taskId)) {
		postCancelled(taskId);
		return;
	}

	// ── Phase 2: OCR pool for image files ────────────────────────────────────
	const imageKeys = uploadedKeys.filter((k) => /\.(jpe?g|png|webp|gif)$/i.test(k));

	if (imageKeys.length > 0) {
		emit({ type: "phase-change", taskId, phase: "ocr" });
		postProgress(taskId, 0.5, `Extracting ${imageKeys.length} file(s)…`);

		for (const key of imageKeys) {
			const s = states.find((st) => st.key === key);
			if (s) { s.status = "ocr"; }
		}
		emitFiles();

		let ocrIdx = 0;

		async function ocrWorker(): Promise<void> {
			while (true) {
				if (cancelledTasks.has(taskId)) return;
				const idx = ocrIdx++;
				if (idx >= imageKeys.length) return;
				const key = imageKeys[idx];

				try {
					const res = await fetchWithTimeout(
						"/api/file/?action=ocr-direct",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ key, tenant }),
							signal: abortController.signal,
						},
						120000,
					);

					if (!res.ok) {
						let msg = `HTTP ${res.status}`;
						try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* skip */ }
						throw new Error(msg);
					}

					const ocrResult = await res.json() as { manifestStatus?: string; contentHash?: string };
					const s = states.find((st) => st.key === key);
					if (s) {
						s.status = "completed";
						s.manifestStatus = ocrResult.manifestStatus;
						s.contentHash = ocrResult.contentHash;
					}
					emitFiles();
				} catch (err) {
					if (err instanceof DOMException && err.name === "AbortError") {
						return; // task cancelled — stop this worker
					}
					const msg = err instanceof Error ? err.message : String(err);
					const s = states.find((st) => st.key === key);
					if (s) {
						s.status = "error";
						s.error = msg;
					}
					emitFiles();
				}
			}
		}

		const ocrWorkers = Array.from(
			{ length: Math.min(OCR_BATCH_SIZE, imageKeys.length) },
			() => ocrWorker(),
		);
		await Promise.all(ocrWorkers);
	}

	// ── Phase 3: Format queue for extracted files ───────────────────────────
	const extractedKeys = states
		.filter((s) => s.status === "completed" && s.manifestStatus === "Extracted" && s.contentHash)
		.map((s) => s.key);

	if (extractedKeys.length > 0) {
		emit({ type: "phase-change", taskId, phase: "format" });
		postProgress(taskId, 0.8, `Formatting ${extractedKeys.length} file(s)…`);

		for (const key of extractedKeys) {
			if (cancelledTasks.has(taskId)) { postCancelled(taskId); return; }
			const s = states.find((st) => st.key === key);
			if (!s || !s.contentHash) continue;
			s.status = "formatting";
			emitFiles();

			const fileName = s.name;
			const contentHash = s.contentHash;

			let formatAttempt = 0;
			const maxFormatAttempts = 3;
			let formatSuccess = false;

			while (formatAttempt < maxFormatAttempts && !formatSuccess) {
				if (cancelledTasks.has(taskId)) { postCancelled(taskId); return; }

				try {
					const formatRes = await fetchWithTimeout(
						"/api/format-document",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ contentHash, fileName, examTypeId: tenant.examTypeId }),
							signal: abortController.signal,
						},
						120000,
					);

					const formatBody = (await formatRes.json()) as {
						success?: boolean;
						rateLimited?: boolean;
						retryAfterSeconds?: number;
						resetAt?: string;
						error?: string;
						manifestStatus?: string;
						contentHash?: string;
						initialMarkdownPath?: string;
						studentFullName?: string | null;
					};

					if (formatBody.rateLimited) {
						const waitSecs = formatBody.retryAfterSeconds ?? 5;
						emit({ type: "rate-limited", taskId, retryAfterSeconds: waitSecs, resetAt: formatBody.resetAt ?? new Date(Date.now() + waitSecs * 1000).toISOString() });
						if (cancelledTasks.has(taskId)) { postCancelled(taskId); return; }
						await new Promise<void>((r) => setTimeout(r, waitSecs * 1000));
						formatAttempt++;
						continue;
					}

					if (!formatRes.ok || !formatBody.success) {
						s.status = "error";
						s.error = formatBody.error ?? `HTTP ${formatRes.status}`;
						emitFiles();
						formatSuccess = true; // don't retry non-rate-limit errors
						break;
					}

					s.status = "completed";
					s.manifestStatus = formatBody.manifestStatus ?? "Formatted";
					emitFiles();
					formatSuccess = true;

					// Push the new marksheet file as a fresh state entry so the
					// page's optimistic library shows it the moment format-document
					// returns. The terminal result aggregator below already keys
					// off `states[].key` so the new entry flows into `results[]`
					// and the prune step on the page removes its optimistic
					// counterpart.
					if (formatBody.initialMarkdownPath) {
						const newName =
							formatBody.initialMarkdownPath.split("/").pop() ??
							formatBody.studentFullName ?? s.name;
						states.push({
							key: formatBody.initialMarkdownPath,
							name: newName,
							status: "completed",
							manifestStatus: formatBody.manifestStatus ?? "Formatted",
							source: "format-output",
						});
						emitFiles();
					}
				} catch (err) {
					if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
						postCancelled(taskId);
						return;
					}
					s.status = "error";
					s.error = err instanceof Error ? err.message : String(err);
					emitFiles();
					formatSuccess = true;
					break;
				}
			}

			if (!formatSuccess) {
				s.status = "error";
				s.error = `Format failed after ${maxFormatAttempts} retries (rate limited)`;
				emitFiles();
			}
		}
	}

	// ── Result ──────────────────────────────────────────────────────────────
	if (cancelledTasks.has(taskId)) {
		postCancelled(taskId);
		return;
	}

	const succeeded = states.filter((s) => s.status === "completed").length;
	const failed = states.filter((s) => s.status === "error").length;
	const results: BatchExtractResult[] = states
		.filter((s) => s.key)
		.map((s) => ({
			key: s.key,
			status: s.status === "completed" ? "success" as const : "error" as const,
			error: s.error,
			manifestStatus: s.manifestStatus,
			contentHash: s.contentHash,
		}));

	if (failed > 0) {
		postFailed(taskId, `${failed} of ${states.length} failed`, { succeeded, failed, results });
	} else {
		postCompleted(taskId, { succeeded, failed, results });
	}
}

async function runOcrSingle(
	taskId: string,
	key: string,
	tenant: SerializedTenant,
): Promise<void> {
	await runOcrBatch(taskId, [key], tenant);
}

/**
 * Run format-document for a batch of extracted files. Processes sequentially
 * (1 file at a time) to respect Groq's rate limits. Handles 429 rate-limit
 * responses with automatic retry and emits `rate-limited` events for the
 * main-thread countdown UI.
 */
async function runFormatBatch(
	taskId: string,
	keys: string[],
	tenant: SerializedTenant,
	contentHashes?: Record<string, string>,
): Promise<void> {
	const abortController = new AbortController();
	abortControllers.set(taskId, abortController);
	postProgress(taskId, 0, `Formatting ${keys.length} file(s)…`);

	// Build per-file state so we can emit progress
	const states: UploadFileState[] = keys.map((key) => ({
		key,
		name: key.split('/').pop() ?? key,
		status: "formatting" as const,
		source: "upload" as const,
	}));
	emit({ type: "file-update", taskId, files: states.map((s) => ({ ...s })) });

	const results: BatchExtractResult[] = [];
	let succeededCount = 0;
	let failedCount = 0;

	for (const key of keys) {
		if (cancelledTasks.has(taskId)) { postCancelled(taskId, { succeeded: succeededCount, failed: failedCount, results }); return; }

		const s = states.find((st) => st.key === key);
		if (!s) continue;

		s.status = "formatting";
		emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });

		const fileName = s.name;
		const hash = contentHashes?.[key] ?? key;

		let formatAttempt = 0;
		const maxFormatAttempts = 3;
		let formatSuccess = false;

		while (formatAttempt < maxFormatAttempts && !formatSuccess) {
			if (cancelledTasks.has(taskId)) { postCancelled(taskId, { succeeded: succeededCount, failed: failedCount, results }); return; }

			try {
				const formatRes = await fetchWithTimeout(
					"/api/format-document",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ contentHash: hash, fileName, examTypeId: tenant.examTypeId }),
						signal: abortController.signal,
					},
					120000,
				);

				const formatBody = (await formatRes.json()) as {
					success?: boolean;
					rateLimited?: boolean;
					retryAfterSeconds?: number;
					resetAt?: string;
					error?: string;
					manifestStatus?: string;
					contentHash?: string;
					initialMarkdownPath?: string;
					studentFullName?: string | null;
				};

				if (formatBody.rateLimited) {
					const waitSecs = formatBody.retryAfterSeconds ?? 5;
					emit({ type: "rate-limited", taskId, retryAfterSeconds: waitSecs, resetAt: formatBody.resetAt ?? new Date(Date.now() + waitSecs * 1000).toISOString() });
					if (cancelledTasks.has(taskId)) { postCancelled(taskId, { succeeded: succeededCount, failed: failedCount, results }); return; }
					await new Promise<void>((r) => setTimeout(r, waitSecs * 1000));
					formatAttempt++;
					continue;
				}

				if (!formatRes.ok || !formatBody.success) {
					s.status = "error";
					s.error = formatBody.error ?? `HTTP ${formatRes.status}`;
					emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });
					results.push({ key, status: "error", error: s.error });
					failedCount++;
					formatSuccess = true;
					break;
				}

				s.status = "completed";
				s.manifestStatus = formatBody.manifestStatus ?? "Formatted";
				emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });
				results.push({ key, status: "success", manifestStatus: s.manifestStatus });
				succeededCount++;
				formatSuccess = true;

				// Push the new marksheet file as a fresh state entry so the
				// optimistic library shows it the moment format-document
				// returns. The terminal result aggregator below already
				// keys off `states[].key` so the new entry flows into
				// `results[]` and the prune step on the page removes its
				// optimistic counterpart.
				if (formatBody.initialMarkdownPath) {
					const newName =
						formatBody.initialMarkdownPath.split("/").pop() ??
						formatBody.studentFullName ?? s.name;
					states.push({
						key: formatBody.initialMarkdownPath,
						name: newName,
						status: "completed",
						manifestStatus: formatBody.manifestStatus ?? "Formatted",
						source: "format-output",
					});
					emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });
				}
			} catch (err) {
				if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) {
					postCancelled(taskId, { succeeded: succeededCount, failed: failedCount, results });
					return;
				}
				s.status = "error";
				s.error = err instanceof Error ? err.message : String(err);
				emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });
				results.push({ key, status: "error", error: s.error });
				failedCount++;
				formatSuccess = true;
				break;
			}
		}

		if (!formatSuccess) {
			s.status = "error";
			s.error = `Format failed after ${maxFormatAttempts} retries (rate limited)`;
			emit({ type: "file-update", taskId, files: states.map((x) => ({ ...x })) });
			results.push({ key, status: "error", error: s.error });
			failedCount++;
		}

		postProgress(taskId, (succeededCount + failedCount) / keys.length, `${succeededCount} formatted, ${failedCount} failed`);
	}

	if (failedCount > 0) {
		postFailed(taskId, `${failedCount} of ${keys.length} failed`, { succeeded: succeededCount, failed: failedCount, results });
	} else {
		postCompleted(taskId, { succeeded: succeededCount, failed: failedCount, results });
	}
}

/**
 * Import photos to the shared/photos/ pool at the academic year root.
 *
 * Per file: compress via `compressImage`, compute SHA-256 content hash,
 * build a sidecar JSON, then PUT to `/api/file/shared/photos/<hash>.<ext>`
 * with multipart `file` + `metadata` fields. Non-image files are counted
 * as `skipped` and never reach the server. The PUT endpoint enforces the
 * IT/Admin/Coordinator/IT-Support designation gate, so the worker simply
 * surfaces upstream 403s as failures.
 */
async function runImportPhotos(
	taskId: string,
	files: Array<{ file: File; name: string }>,
	tenant: SerializedTenant,
): Promise<void> {
	const results: BatchExtractResult[] = [];
	let succeeded = 0;
	let failed = 0;
	const skipped = files.filter(f => !/\.(jpe?g|png|webp)$/i.test(f.name)).length;
	const imageFiles = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
	const total = imageFiles.length;

	if (total === 0) {
		const summary = skipped > 0 ? `No images found (${skipped} skipped)` : "No images found";
		postCompleted(taskId, { succeeded: 0, failed: 0, results });
		postProgress(taskId, 1, summary);
		return;
	}

	for (let i = 0; i < imageFiles.length; i++) {
		if (cancelledTasks.has(taskId)) {
			postCancelled(taskId, { succeeded, failed, results });
			return;
		}

		const { file, name } = imageFiles[i];
		const key = name;
		try {
			postProgress(taskId, i / total, `Compressing ${name} (${i + 1}/${total})…`);
			const result = await compressImage(file);
			const compressed = result.file;
			const filename = filenameForMime(name, compressed.type);
			const ext = (filename.split(".").pop() ?? compressed.type.split("/").pop() ?? "jpg").toLowerCase();

			const contentHash = await sha256Hex(compressed);
			const sidecar = JSON.stringify({
				originalName: name,
				size: result.stats.compressedSize,
				uploadedAt: new Date().toISOString(),
				uploadedBy: tenant.staffId,
			});

			postProgress(taskId, i / total, `Uploading ${name} (${i + 1}/${total})…`);
			const form = new FormData();
			form.set("file", compressed, `${contentHash}.${ext}`);
			form.set("metadata", sidecar);
			const url = `/api/file/shared/photos/${contentHash}.${ext}`;
			const res = await fetch(url, { method: "PUT", body: form });
			if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => "")}`);

			succeeded++;
			results.push({ key: name, status: "success", contentHash, ext });
			postProgress(taskId, (i + 1) / total, `Imported ${succeeded}/${total}`);
		} catch (err) {
			failed++;
			const message = err instanceof Error ? err.message : String(err);
			results.push({ key, status: "error", error: message });
		}
	}

	const tail = skipped > 0 ? ` (${skipped} skipped)` : "";
	if (failed > 0) {
		postFailed(taskId, `Imported ${succeeded}/${total}, ${failed} failed${tail}`, {
			succeeded,
			failed,
			results,
		});
	} else {
		postCompleted(taskId, { succeeded, failed, results });
	}
}

/** SHA-256 of a Blob as a lowercase hex string. */
async function sha256Hex(blob: Blob): Promise<string> {
	const buf = await blob.arrayBuffer();
	const digest = await crypto.subtle.digest("SHA-256", buf);
	const bytes = new Uint8Array(digest);
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		const hex = bytes[i].toString(16);
		out += hex.length === 1 ? `0${hex}` : hex;
	}
	return out;
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
			case "process-files":
				await runFilePipeline(taskId, spec.files, spec.tenant, spec.prefix, spec.examTypeId);
				break;
			case "format-batch":
				await runFormatBatch(taskId, spec.keys, spec.tenant, spec.contentHashes);
				break;
			case "import-photos":
				await runImportPhotos(taskId, spec.files, spec.tenant);
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
 *   - For `process-files` (upload+OCR pipeline): sets `cancelledTasks`
 *     and aborts the controller, which cancels all in-flight PUT and
 *     OCR fetch requests. The pipeline checks `cancelledTasks` before
 *     each batch and after AbortError, posting `cancelled` and returning.
 */
function handleCancel(taskId: string): void {
	cancelledTasks.add(taskId);
	const controller = abortControllers.get(taskId);
	if (controller) {
		controller.abort();
	}
}
