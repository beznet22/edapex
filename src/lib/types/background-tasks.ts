/**
 * Background Tasks — EdApex
 *
 * Generic discriminated-union types for tasks that run in the dedicated
 * `task-worker.ts` web worker. The worker is a thin router: it dispatches
 * each `TaskSpec` to a typed handler that talks to the server via `fetch`,
 * and posts `TaskEvent` messages back to the main thread for UI rendering.
 *
 * Why a worker?
 * - Long-running polling (Mistral batch OCR can take 30s-2min) blocks the
 *   main thread even with `setTimeout`. A dedicated worker keeps the chat
 *   input responsive while extraction is in flight.
 * - Single shared worker instance — `backgroundTasks` owns it.
 *
 * The shape is intentionally narrow: each new task kind adds ONE entry to
 * the `TaskSpec` union and ONE `switch` case in the worker router.
 */

export type SerializedTenant = {
  schoolId: number;
  userId: number;
  designationId: number;
  staffId: number;
  classId: number | null;
  sectionId: number | null;
  examTypeId: number | null;
  academicId: number | null;
  className: string | null;
  sectionName: string | null;
  academicYearTitle: string | null;
  /**
   * Resolved user-role string (e.g. 'class_teacher') from
   * `DESIGNATIONS[designationId]`. Used by the Mistral OCR key
   * resolver's school-pool tier so the `consumerRoles` allowlist
   * gate fires for batch/file-OCR routes — same string the chat
   * pipeline uses. Null when not set (then the pool is skipped).
   */
  userRole: string | null;
};

/**
 * Per-file result from a batch OCR job. The `key` is the workspace key of
 * the source file.
 */
export type BatchExtractResult = {
  key: string;
  status: "success" | "error";
  contentHash?: string;
  mistralFileId?: string;
  error?: string;
  manifestStatus?: string;
};

/**
 * Per-file state for the upload+OCR pipeline (kind: "process-files").
 * Updated incrementally via `file-update` events from the worker.
 */
export type UploadFileState = {
	key: string;
	name: string;
	status: "compressing" | "uploading" | "ocr" | "formatting" | "completed" | "error";
	error?: string;
	compressedSize?: number;
	originalSize?: number;
	manifestStatus?: string;
	contentHash?: string;
	source?: "upload" | "format-output";
};

export type TaskPhase = "upload" | "ocr" | "format";

export type TaskSpec =
  | {
      kind: "ocr-batch";
      keys: string[];
      tenant: SerializedTenant;
    }
  | {
      kind: "ocr-single";
      key: string;
      tenant: SerializedTenant;
    }
  | {
      kind: "ocr-direct";
      key: string;
      tenant: SerializedTenant;
    }
  | {
      kind: "process-files";
      files: Array<{ file: File; name: string }>;
      tenant: SerializedTenant;
      prefix: string;
      examTypeId: number;
    }
  | {
      kind: "format-batch";
      keys: string[];
      contentHashes?: Record<string, string>;
      tenant: SerializedTenant;
    };

export type TaskEvent =
	| { type: "started"; taskId: string }
	| { type: "progress"; taskId: string; progress: number; message: string }
	| { type: "file-update"; taskId: string; files: UploadFileState[] }
	| { type: "phase-change"; taskId: string; phase: TaskPhase }
	| { type: "rate-limited"; taskId: string; retryAfterSeconds: number; resetAt: string }
	| {
			type: "completed";
			taskId: string;
			result: { succeeded: number; failed: number; results: BatchExtractResult[] };
	  }
	| {
			type: "failed";
			taskId: string;
			error: string;
			partial?: { succeeded: number; failed: number; results: BatchExtractResult[] };
	  }
	| {
			type: "cancelled";
			taskId: string;
			partial?: { succeeded: number; failed: number; results: BatchExtractResult[] };
	  };

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type Task = {
	id: string;
	spec: TaskSpec;
	status: TaskStatus;
	phase?: TaskPhase;
	files?: UploadFileState[];
	progress: number;
	message: string;
	startedAt: number;
	completedAt?: number;
	result?: { succeeded: number; failed: number; results: BatchExtractResult[] };
	error?: string;
	rateLimitInfo?: { retryAfterSeconds: number; resetAt: string; countdownEnd: number };
};

export type WorkerInbound =
	| { type: "run"; taskId: string; spec: TaskSpec }
	| { type: "cancel"; taskId: string };
