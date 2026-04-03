/**
 * ==========================================
 * Shared AI Types — Heartbeat, SSE, Stress Defense
 * ==========================================
 * Used by: HeartbeatService, AIService, ClassroomService, Routes
 */

// --- Heartbeat Engine ---

export type HeartbeatStatus = "idle" | "running" | "cooldown" | "stress_lab" | "error";

export interface HeartbeatTick {
  tickId: string;
  tenantId: string;
  status: HeartbeatStatus;
  claimedTaskId: string | null;
  agentId: string | null;
  timestampMs: number;
  driftMs: number; // clock sync drift
}

export interface WakeupRequest {
  tenantId: string;
  agentId: string;
  taskId?: string;
  idempotencyKey: string;
  requestedAt: number; // unix ms
}

// --- SSE Streaming ---

export interface StatelessEvent {
  type: "action" | "text" | "heartbeat" | "error" | "session_end";
  data: unknown;
  sessionId?: string;
  turnCount?: number;
  timestamp: number;
}

// --- Stress Defense Tools ---

/**
 * Idempotency key generator output.
 * SHA-256 hash of (tenant_id, entity_type, natural_key, timestamp_bucket).
 */
export interface IdempotencyKeyResult {
  key: string;
  bucket: string;
  isNew: boolean;
}

/**
 * Clock sync validation result.
 * Ensures server timestamp drift < threshold across distributed edge nodes.
 */
export interface ClockSyncResult {
  serverTimeMs: number;
  clientTimeMs: number;
  driftMs: number;
  isValid: boolean;
  maxDriftMs: number;
}

/**
 * Atomic state checkpoint — snapshot of tenant state before high-risk mutations.
 */
export interface StateCheckpoint {
  checkpointId: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  snapshotJson: string;
  createdAt: number;
}

// --- Agent Pulse Stream ---

export interface AgentPulseEvent {
  eventType: "task_claimed" | "task_completed" | "heartbeat_tick" | "cost_event" | "session_start" | "session_end";
  tenantId: string;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
