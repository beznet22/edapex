/**
 * Session lifecycle states and structured failures.
 *
 * The worker and the client interpret the same union, so a UI can tell "still
 * acquiring" from "another tab owns it" from "OPFS itself is unavailable"
 * without inspecting worker internals.
 */

export type AgentLifecycleState =
  | "created"
  | "connecting"
  | "acquiring_lease"
  | "initializing"
  | "ready"
  | "shutting_down"
  | "closed"
  | "failed";

export type AgentFailureCode =
  | "lease_locked"
  | "invalid_input"
  | "storage_unavailable"
  | "storage_corrupted"
  | "initialization_failed"
  | "unsupported_capability"
  | "cancelled"
  | "runtime_error";

export interface AgentFailure {
  readonly code: AgentFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

const CODES: readonly AgentFailureCode[] = [
  "lease_locked",
  "invalid_input",
  "storage_unavailable",
  "storage_corrupted",
  "initialization_failed",
  "unsupported_capability",
  "cancelled",
  "runtime_error"
];

export function failure(code: AgentFailureCode, message: string, retryable = false): AgentFailure {
  return { code, message, retryable };
}

function isCode(value: string): value is AgentFailureCode {
  return (CODES as readonly string[]).includes(value);
}

/**
 * Normalises anything thrown across the Rust/wasm boundary into a failure.
 *
 * Rust surfaces `AgentError` as JSON; a JavaScript driver throws plain text with
 * a `code:` prefix. Quota exhaustion is called out because it is the one storage
 * failure a person can act on.
 */
export function failureOf(cause: unknown, fallback: AgentFailureCode): AgentFailure {
  if (cause instanceof Error) return failureOf(cause.message, fallback);
  if (typeof cause !== "string" || cause.length === 0) {
    return failure(fallback, "The agent runtime could not complete the operation.");
  }

  try {
    const parsed: unknown = JSON.parse(cause);
    if (typeof parsed === "object" && parsed !== null && "code" in parsed && "message" in parsed
      && typeof parsed.code === "string" && typeof parsed.message === "string") {
      return {
        code: isCode(parsed.code) ? parsed.code : fallback,
        message: parsed.message,
        retryable: "retryable" in parsed && parsed.retryable === true
      };
    }
  } catch {
    // A plain message is more useful to a person than a parse error.
  }

  const [prefix, ...rest] = cause.split(":");
  if (isCode(prefix) && rest.length > 0) {
    return failure(prefix, cause, prefix === "storage_unavailable" || prefix === "lease_locked");
  }
  if (cause.toLowerCase().includes("quota")) {
    return failure("storage_unavailable", "The browser storage quota was exceeded. Free space, then retry.", true);
  }
  return failure(fallback, cause, fallback === "storage_unavailable");
}

/**
 * The lock name for one storage-sharing boundary.
 *
 * Derived from the VFS directory rather than a thread id: two tabs may hold two
 * different sessions at once, but never the same directory, because
 * `AccessHandlePoolVFS` owns every access handle beneath it.
 */
export function lockNameFor(directory: string): string {
  return `edapex-infinity-opfs-v1:${directory}`;
}
