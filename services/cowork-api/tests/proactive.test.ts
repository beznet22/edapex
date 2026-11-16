import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";

/**
 * Proactive work.
 *
 * Two acceptance criteria from chunk 4 are protocol properties, so they are
 * asserted against the running Worker: one brief per day across devices, and no
 * cron fan-out anywhere.
 */

const app = createApp();

const cookie = { cookie: "edapex_session=user-1", "content-type": "application/json" };

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, { method: "POST", headers: cookie, body: JSON.stringify(body) }, env);
}

/** Today in the caller's local shape, which the server validates against UTC. */
function localDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function seedRoutine(id: string, enabled = 1, nextRunAt = 0): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.AGENT_DB.prepare(
    "INSERT OR REPLACE INTO routines \
     (id, workspace_id, agent_id, title, instructions, schedule, enabled, next_run_at, created_at, updated_at) \
     VALUES (?, 'ws-1', 'agent-1', 'Morning', 'Do the thing', '0 8 * * *', ?, ?, ?, ?)"
  )
    .bind(id, enabled, nextRunAt, now, now)
    .run();
}

describe("brief dedupe", () => {
  it("lets the first device claim and refuses the second", async () => {
    const date = localDate();
    const first = await post("/api/v1/agent/briefs/claim", {
      workspaceId: "ws-brief-a",
      localDate: date,
      deviceId: "device-a"
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { kind: string }).kind).toBe("claimed");

    const second = await post("/api/v1/agent/briefs/claim", {
      workspaceId: "ws-brief-a",
      localDate: date,
      deviceId: "device-b"
    });
    expect(((await second.json()) as { kind: string }).kind).toBe("held_by_other");
  });

  it("is permanent once completed", async () => {
    const date = localDate();
    const workspaceId = "ws-brief-done";

    const claim = await post("/api/v1/agent/briefs/claim", {
      workspaceId,
      localDate: date,
      deviceId: "device-a"
    });
    expect(((await claim.json()) as { kind: string }).kind).toBe("claimed");

    const complete = await post("/api/v1/agent/briefs/complete", {
      workspaceId,
      localDate: date,
      deviceId: "device-a",
      briefId: "brief-1"
    });
    expect(complete.status).toBe(204);

    // Even from another device, and even after the lease would have expired, the
    // day stays done. This is the property a single "done" flag gets wrong in the
    // other direction — see the takeover test below.
    const again = await post("/api/v1/agent/briefs/claim", {
      workspaceId,
      localDate: date,
      deviceId: "device-b"
    });
    expect(((await again.json()) as { kind: string }).kind).toBe("already_complete");
  });

  it("allows takeover when the claimant's lease expired", async () => {
    const date = localDate();
    const workspaceId = "ws-brief-stale";

    await post("/api/v1/agent/briefs/claim", { workspaceId, localDate: date, deviceId: "device-a" });

    // Simulate the claimant dying: the lease is in the past with nothing completed.
    await env.AGENT_DB.prepare(
      "UPDATE brief_claims SET lease_until = ? WHERE workspace_id = ? AND local_date = ?"
    )
      .bind(Math.floor(Date.now() / 1000) - 1, workspaceId, date)
      .run();

    const takeover = await post("/api/v1/agent/briefs/claim", {
      workspaceId,
      localDate: date,
      deviceId: "device-b"
    });
    const body = (await takeover.json()) as { kind: string; takeover: boolean };
    expect(body.kind).toBe("claimed");
    expect(body.takeover).toBe(true);
  });

  it("refuses a claim for a distant day", async () => {
    // Claiming tomorrow's key would produce a second brief today.
    const response = await post("/api/v1/agent/briefs/claim", {
      workspaceId: "ws-brief-far",
      localDate: localDate(5),
      deviceId: "device-a"
    });
    expect(response.status).toBe(400);
  });

  it("does not let a non-claiming device complete the brief", async () => {
    const date = localDate();
    const workspaceId = "ws-brief-owner";
    await post("/api/v1/agent/briefs/claim", { workspaceId, localDate: date, deviceId: "device-a" });

    const response = await post("/api/v1/agent/briefs/complete", {
      workspaceId,
      localDate: date,
      deviceId: "device-b",
      briefId: "brief-1"
    });
    expect(response.status).toBe(409);
  });
});

describe("routine claims", () => {
  it("claims once and refuses a second live claim", async () => {
    await seedRoutine("routine-a");
    const first = await post("/api/v1/agent/routines/routine-a/claim", { deviceId: "device-a" });
    expect(((await first.json()) as { kind: string }).kind).toBe("claimed");

    const second = await post("/api/v1/agent/routines/routine-a/claim", { deviceId: "device-b" });
    expect((await second.json()) as { kind: string }).toMatchObject({
      kind: "refused",
      reason: "held_by_other"
    });
  });

  it("takes over a run whose lease expired", async () => {
    await seedRoutine("routine-stale");
    await post("/api/v1/agent/routines/routine-stale/claim", { deviceId: "device-a" });

    await env.AGENT_DB.prepare(
      "UPDATE routine_runs SET lease_until = ? WHERE routine_id = 'routine-stale'"
    )
      .bind(Math.floor(Date.now() / 1000) - 1)
      .run();

    const takeover = await post("/api/v1/agent/routines/routine-stale/claim", { deviceId: "device-b" });
    expect((await takeover.json()) as { kind: string }).toMatchObject({
      kind: "claimed",
      takeover: true
    });
  });

  it("refuses a disabled routine", async () => {
    await seedRoutine("routine-off", 0);
    const response = await post("/api/v1/agent/routines/routine-off/claim", { deviceId: "device-a" });
    expect((await response.json()) as { reason: string }).toMatchObject({ reason: "disabled" });
  });

  it("records a failure rather than swallowing it", async () => {
    await seedRoutine("routine-fail");
    const claim = await post("/api/v1/agent/routines/routine-fail/claim", { deviceId: "device-a" });
    const { runId } = (await claim.json()) as { runId: string };

    const finish = await post(`/api/v1/agent/routines/runs/${runId}/finish`, {
      status: "failed",
      error: "the connector timed out"
    });
    expect(finish.status).toBe(204);

    const row = await env.AGENT_DB.prepare(
      "SELECT status, error FROM routine_runs WHERE id = ?"
    )
      .bind(runId)
      .first<{ status: string; error: string }>();

    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("the connector timed out");
  });

  it("rejects an invalid status", async () => {
    await seedRoutine("routine-bad");
    const claim = await post("/api/v1/agent/routines/routine-bad/claim", { deviceId: "device-a" });
    const { runId } = (await claim.json()) as { runId: string };

    const response = await post(`/api/v1/agent/routines/runs/${runId}/finish`, {
      status: "maybe"
    });
    expect(response.status).toBe(400);
  });
});

describe("read routes", () => {
  it("lists routines for a workspace", async () => {
    await seedRoutine("routine-list", 1, 500);

    const response = await app.request(
      "/api/v1/agent/routines?workspaceId=ws-1",
      { headers: cookie },
      env
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { routines: { id: string }[] };
    expect(body.routines.map((row) => row.id)).toContain("routine-list");
  });

  it("returns task signals as facts, not a status", async () => {
    const now = Math.floor(Date.now() / 1000);
    await env.AGENT_DB.prepare(
      "INSERT OR REPLACE INTO tasks \
       (id, workspace_id, owner_user_id, agent_id, title, why, open_question, blocked_on_approval, \
        failed_after_retries, running, finished_unresolved, resolved_at, attempts, max_attempts, last_error, created_at, updated_at) \
       VALUES ('task-1', 'ws-1', '1', 'agent-1', 'Approve the report', 'AY4 needs sign-off', 1, 0, 0, 0, 0, NULL, 2, 3, 'connector timed out', ?, ?)"
    )
      .bind(now, now)
      .run();

    const response = await app.request("/api/v1/agent/tasks?workspaceId=ws-1", { headers: cookie }, env);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      tasks: {
        id: string;
        signals: Record<string, boolean>;
        attempts: number;
        lastError: string | null;
      }[];
    };

    const task = body.tasks.find((row) => row.id === "task-1");
    expect(task).toBeDefined();
    // No `status` field: the client derives it with the shared pure function.
    expect(task).not.toHaveProperty("status");
    expect(task!.signals.openQuestion).toBe(true);
    expect(task!.attempts).toBe(2);
    expect(task!.lastError).toBe("connector timed out");
  });

  it("requires a workspace id", async () => {
    const response = await app.request("/api/v1/agent/tasks", { headers: cookie }, env);
    expect(response.status).toBe(400);
  });
});
