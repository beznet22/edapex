import { z } from "zod";

/**
 * Entity types the sync channel will carry.
 *
 * An allowlist rather than a free string, and deliberately narrow: the sync
 * service must never become a route for school records. A client that tries to
 * push `students` is rejected at validation, before a statement is prepared.
 */
export const ENTITY_TYPES = [
  "threads",
  "messages",
  "message_parts",
  "runs",
  "tool_calls",
  "approval_requests",
  "approval_rules",
  "tasks",
  "artifacts",
  "artifact_versions",
  "memory_facts"
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const OPERATIONS = ["create", "update", "delete", "tombstone"] as const;

/** A sealed record exactly as the device produced it. */
export const syncEventSchema = z.object({
  id: z.string().min(1).max(200),
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(200),
  operation: z.enum(OPERATIONS),
  /** Base64 of `version || nonce || ciphertext || tag`. Opaque here. */
  ciphertext: z
    .string()
    .min(1)
    .max(700_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "ciphertext must be base64"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/, "checksum must be lowercase hex sha256"),
  deviceSeq: z.number().int().positive(),
  createdAt: z.number().int().nonnegative()
});

export type SyncEventInput = z.infer<typeof syncEventSchema>;

export const pushSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  events: z.array(syncEventSchema).min(1).max(200)
});

export type PushInput = z.infer<typeof pushSchema>;

/**
 * Cursors are opaque `"<receivedAt>:<id>"`.
 *
 * A bare integer would need a server-assigned dense sequence, which D1 cannot
 * provide without either a second round trip per batch or an AUTOINCREMENT
 * primary key the spec does not have. A compound key ordered by `(received_at,
 * id)` is total and stable.
 */
export const cursorSchema = z
  .string()
  .regex(/^(?:\d+:[\s\S]*)?$/, "cursor must be empty or <receivedAt>:<id>")
  .default("");

export const pullQuerySchema = z.object({
  workspaceId: z.string().min(1).max(200),
  deviceId: z.string().min(1).max(200),
  cursor: cursorSchema,
  limit: z.coerce.number().int().positive().max(200).default(100)
});

export type PullQuery = z.infer<typeof pullQuerySchema>;

export const registerDeviceSchema = z.object({
  publicKey: z.string().min(1).max(4096),
  name: z.string().min(1).max(120).optional()
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "device_revoked",
  "device_unknown",
  "workspace_mismatch",
  "internal"
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  readonly error: {
    readonly message: string;
    readonly code: ErrorCode;
  };
}

export function apiError(message: string, code: ErrorCode): ApiError {
  return { error: { message, code } };
}
