/**
 * Stress Defense Tools — Clock Sync & Atomic Checkpoint Tests
 *
 * Layer 1 Resilience:
 *   - clock_sync_validator: Tests drifted timestamps across edge nodes.
 *   - atomic_state_checkpoint: Tests state capture and rollback capability.
 */

import { describe, it, expect } from "vitest";
import { validateClockSync, captureStateCheckpoint } from "../services/ai/heartbeat.service.js";

describe("clock_sync_validator — Temporal State Corruption Defense", () => {
  it("should accept timestamps within 5s drift threshold", () => {
    const result = validateClockSync(Date.now() - 2_000); // 2s ago
    expect(result.isValid).toBe(true);
    expect(result.driftMs).toBeLessThanOrEqual(5_000);
  });

  it("should accept exact server time (0 drift)", () => {
    const result = validateClockSync(Date.now());
    expect(result.isValid).toBe(true);
    expect(result.driftMs).toBeLessThanOrEqual(100); // Allow tiny execution delay
  });

  it("should reject timestamps with drift > 5s", () => {
    const result = validateClockSync(Date.now() - 10_000); // 10s ago
    expect(result.isValid).toBe(false);
    expect(result.driftMs).toBeGreaterThan(5_000);
  });

  it("should reject future timestamps with drift > 5s", () => {
    const result = validateClockSync(Date.now() + 10_000); // 10s in the future
    expect(result.isValid).toBe(false);
    expect(result.driftMs).toBeGreaterThan(5_000);
  });

  it("should respect custom drift threshold", () => {
    const result = validateClockSync(Date.now() - 3_000, 2_000); // 3s drift, 2s threshold
    expect(result.isValid).toBe(false);
    expect(result.maxDriftMs).toBe(2_000);
  });

  it("should include all required fields in result", () => {
    const result = validateClockSync(Date.now());
    expect(result).toHaveProperty("serverTimeMs");
    expect(result).toHaveProperty("clientTimeMs");
    expect(result).toHaveProperty("driftMs");
    expect(result).toHaveProperty("isValid");
    expect(result).toHaveProperty("maxDriftMs");
    expect(typeof result.serverTimeMs).toBe("number");
    expect(typeof result.clientTimeMs).toBe("number");
    expect(typeof result.driftMs).toBe("number");
  });

  it("should detect extreme clock skew (1 hour drift)", () => {
    const result = validateClockSync(Date.now() - 3_600_000); // 1 hour ago
    expect(result.isValid).toBe(false);
    expect(result.driftMs).toBeGreaterThanOrEqual(3_600_000);
  });
});

describe("atomic_state_checkpoint — State Capture & Rollback Defense", () => {
  it("should capture a valid checkpoint with all required fields", () => {
    const state = { status: "todo", assigneeAgentId: "agent-001", priority: "high" };
    const checkpoint = captureStateCheckpoint("tenant-001", "ai_task", "task-001", state);

    expect(checkpoint.checkpointId).toBeDefined();
    expect(checkpoint.tenantId).toBe("tenant-001");
    expect(checkpoint.entityType).toBe("ai_task");
    expect(checkpoint.entityId).toBe("task-001");
    expect(checkpoint.createdAt).toBeGreaterThan(0);
    expect(typeof checkpoint.snapshotJson).toBe("string");
  });

  it("should serialize state to valid JSON", () => {
    const state = { status: "in_progress", metadata: { nested: true, count: 42 } };
    const checkpoint = captureStateCheckpoint("tenant-001", "ai_session", "session-001", state);

    const parsed = JSON.parse(checkpoint.snapshotJson);
    expect(parsed.status).toBe("in_progress");
    expect(parsed.metadata.nested).toBe(true);
    expect(parsed.metadata.count).toBe(42);
  });

  it("should generate unique checkpoint IDs for each capture", () => {
    const state = { status: "todo" };
    const cp1 = captureStateCheckpoint("tenant-001", "ai_task", "task-001", state);
    const cp2 = captureStateCheckpoint("tenant-001", "ai_task", "task-001", state);

    expect(cp1.checkpointId).not.toBe(cp2.checkpointId);
  });

  it("should preserve empty state objects", () => {
    const checkpoint = captureStateCheckpoint("tenant-001", "ai_task", "task-001", {});

    const parsed = JSON.parse(checkpoint.snapshotJson);
    expect(parsed).toEqual({});
  });

  it("should handle large state objects", () => {
    const largeState: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeState[`field_${i}`] = `value_${i}`.repeat(10);
    }
    const checkpoint = captureStateCheckpoint("tenant-001", "ai_task", "task-001", largeState);

    const parsed = JSON.parse(checkpoint.snapshotJson);
    expect(Object.keys(parsed)).toHaveLength(100);
  });
});
