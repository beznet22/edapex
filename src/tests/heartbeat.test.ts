/**
 * Heartbeat Service — Atomic Checkout Race Condition Tests
 *
 * Layer 1 Resilience: Simulates concurrent task claim scenarios
 * to verify that the atomic checkout pattern prevents double-claiming.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeartbeatService } from "../services/ai/heartbeat.service.js";
import type { IAiRepository } from "../domain/interfaces/ai.interface.js";
import type { UnifiedConfig } from "../config/index.js";
import type { WakeupRequest } from "../types/ai.types.js";

function createMockConfig(overrides: Partial<UnifiedConfig> = {}): UnifiedConfig {
  return {
    mode: "development",
    isStressLab: false,
    rateLimits: { humanPerMinute: 50, aiPerMinute: 1000 },
    heartbeatIntervalMs: 30_000,
    ai: { maxTokensPerTask: 8192, maxCostCentsPerTask: 50, defaultProvider: "workers-ai" },
    ...overrides,
  };
}

function createMockRepo(): IAiRepository {
  return {
    getChatById: vi.fn(),
    getChatsByUser: vi.fn(),
    createChat: vi.fn(),
    updateChat: vi.fn(),
    getMessagesByChat: vi.fn(),
    createMessage: vi.fn(),
    upsertVote: vi.fn(),
    getAgentById: vi.fn(),
    getAgentsByTenant: vi.fn(),
    createAction: vi.fn(),
    updateAction: vi.fn(),
    getActionByIdempotencyKey: vi.fn(),
    createToolInvocation: vi.fn(),
    getTaskById: vi.fn(),
    checkoutTask: vi.fn(),
    updateTask: vi.fn(),
    createApproval: vi.fn(),
    getPendingApprovals: vi.fn(),
    createGoal: vi.fn(),
    reportCost: vi.fn(),
  } as unknown as IAiRepository;
}

function buildWakeupRequest(overrides: Partial<WakeupRequest> = {}): WakeupRequest {
  return {
    tenantId: "tenant-001",
    agentId: "agent-001",
    taskId: "task-001",
    idempotencyKey: "idem-001",
    requestedAt: Date.now(),
    ...overrides,
  };
}

describe("HeartbeatService — Atomic Checkout", () => {
  let service: HeartbeatService;
  let repo: IAiRepository;

  beforeEach(() => {
    repo = createMockRepo();
    service = new HeartbeatService(createMockConfig(), repo);
  });

  it("should claim a task via atomic checkout", async () => {
    const mockTask = { id: "task-001", tenantId: "tenant-001", status: "in_progress" };
    (repo.getTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
    (repo.checkoutTask as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);

    const tick = await service.processWakeup(buildWakeupRequest());

    expect(tick.status).toBe("running");
    expect(tick.claimedTaskId).toBe("task-001");
    expect(repo.checkoutTask).toHaveBeenCalledWith("tenant-001", "task-001", "agent-001");
  });

  it("should handle checkout failure (already claimed by another agent)", async () => {
    const mockTask = { id: "task-001", tenantId: "tenant-001", status: "in_progress" };
    (repo.getTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
    (repo.checkoutTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Task already checked out"));

    const tick = await service.processWakeup(buildWakeupRequest());

    expect(tick.status).toBe("idle");
    expect(tick.claimedTaskId).toBeNull();
  });

  it("should prevent concurrent claims — only first checkout succeeds", async () => {
    let checkoutCount = 0;
    const mockTask = { id: "task-001", tenantId: "tenant-001", status: "in_progress" };
    (repo.getTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask);
    (repo.checkoutTask as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      checkoutCount++;
      if (checkoutCount > 1) throw new Error("Task already checked out");
      return mockTask;
    });

    // Simulate 10 concurrent wakeup requests for the same task
    const requests = Array.from({ length: 10 }, (_, i) =>
      service.processWakeup(buildWakeupRequest({ agentId: `agent-${i}` })),
    );

    const ticks = await Promise.all(requests);
    const claimed = ticks.filter((t) => t.claimedTaskId !== null);
    const idle = ticks.filter((t) => t.status === "idle");

    expect(claimed.length).toBe(1);
    expect(idle.length).toBe(9);
  });

  it("should reject wakeup with excessive clock drift", async () => {
    const request = buildWakeupRequest({ requestedAt: Date.now() - 60_000 }); // 60s drift
    const tick = await service.processWakeup(request);

    expect(tick.status).toBe("error");
    expect(tick.driftMs).toBeGreaterThan(5_000);
    expect(repo.checkoutTask).not.toHaveBeenCalled();
  });

  it("should enter STRESS_LAB mode and skip real checkout", async () => {
    const stressService = new HeartbeatService(createMockConfig({ isStressLab: true }), repo);

    const tick = await stressService.processWakeup(buildWakeupRequest());

    expect(tick.status).toBe("stress_lab");
    expect(tick.claimedTaskId).toBeNull();
    expect(repo.checkoutTask).not.toHaveBeenCalled();
  });

  it("should handle wakeup without taskId (status check only)", async () => {
    const tick = await service.processWakeup(buildWakeupRequest({ taskId: undefined }));

    expect(tick.status).toBe("idle");
    expect(tick.claimedTaskId).toBeNull();
    expect(repo.checkoutTask).not.toHaveBeenCalled();
  });
});
