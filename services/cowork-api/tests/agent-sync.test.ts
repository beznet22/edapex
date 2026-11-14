import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { checksumOf } from "../src/services/sync";

/**
 * Sync channel behaviour.
 *
 * The acceptance criteria for this chunk are protocol properties — idempotent
 * push, device revocation, cursor correctness, and the absence of school data —
 * so they are asserted against the running Worker rather than by unit-testing
 * helpers.
 */

const app = createApp();

const cookie = (userId: number): Record<string, string> => ({
  cookie: `edapex_session=user-${userId}`,
  "content-type": "application/json"
});

async function request(
  path: string,
  init: RequestInit & { userId?: number } = {}
): Promise<Response> {
  const { userId = 1, ...rest } = init;
  const headers = new Headers(rest.headers);
  for (const [name, value] of Object.entries(cookie(userId))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return app.request(path, { ...rest, headers }, env);
}

let deviceCounter = 0;

async function registerDevice(userId = 1): Promise<string> {
  deviceCounter += 1;
  const response = await request("/api/v1/agent/devices", {
    method: "POST",
    body: JSON.stringify({ publicKey: `pk-${deviceCounter}`, name: `Device ${deviceCounter}` }),
    userId
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { device: { id: string } };
  return body.device.id;
}

async function makeEvent(
  overrides: Partial<{
    id: string;
    entityType: string;
    deviceSeq: number;
    ciphertext: string;
    checksum: string;
  }> = {}
): Promise<{
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  ciphertext: string;
  checksum: string;
  deviceSeq: number;
  createdAt: number;
}> {
  const ciphertext = overrides.ciphertext ?? btoa("sealed-record-bytes");
  return {
    id: overrides.id ?? `evt-${crypto.randomUUID()}`,
    entityType: overrides.entityType ?? "messages",
    entityId: "m-1",
    operation: "create",
    ciphertext,
    checksum: overrides.checksum ?? (await checksumOf(ciphertext)),
    deviceSeq: overrides.deviceSeq ?? 1,
    createdAt: 1_700_000_000_000
  };
}

describe("health", () => {
  it("reports itself without touching a binding", async () => {
    const response = await request("/health", { userId: 1 });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { service: string }).service).toBe("cowork-api");
  });
});

describe("authentication", () => {
  it("rejects a request with no session", async () => {
    const response = await app.request("/api/v1/agent/devices", {}, env);
    expect(response.status).toBe(401);
  });

  it("rejects a session that sms-api does not recognise", async () => {
    // The stub only accepts `user-<n>`; this cookie matches neither.
    const response = await app.request(
      "/api/v1/agent/devices",
      { headers: { cookie: "edapex_session=not-a-user" } },
      env
    );
    expect(response.status).toBe(401);
  });
});

describe("device registry", () => {
  it("registers and lists a device", async () => {
    const id = await registerDevice();
    const response = await request("/api/v1/agent/devices", { userId: 1 });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { devices: { id: string }[] };
    expect(body.devices.some((device) => device.id === id)).toBe(true);
  });

  it("revokes a device, and a revoked device can no longer push", async () => {
    const id = await registerDevice();
    const revoked = await request(`/api/v1/agent/devices/${id}`, {
      method: "DELETE",
      userId: 1
    });
    expect(revoked.status).toBe(204);

    const push = await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws-1", deviceId: id, events: [await makeEvent()] }),
      userId: 1
    });
    expect(push.status).toBe(403);
    expect(((await push.json()) as { error: { code: string } }).error.code).toBe("device_revoked");
  });

  it("cannot revoke another account's device", async () => {
    const id = await registerDevice(1);
    const response = await request(`/api/v1/agent/devices/${id}`, {
      method: "DELETE",
      userId: 2
    });
    expect(response.status).toBe(404);
  });

  it("cannot push as another account's device", async () => {
    const id = await registerDevice(1);
    const response = await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws-1", deviceId: id, events: [await makeEvent()] }),
      userId: 2
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "device_unknown"
    );
  });
});

describe("push", () => {
  it("accepts a batch and reports the cursor", async () => {
    const deviceId = await registerDevice();
    const response = await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws-1",
        deviceId,
        events: [await makeEvent({ deviceSeq: 1 }), await makeEvent({ deviceSeq: 2 })]
      }),
      userId: 1
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { accepted: number; cursor: number };
    expect(body.accepted).toBe(2);
    expect(body.cursor).toBe(2);
  });

  it("is idempotent: replaying a batch accepts nothing new", async () => {
    const deviceId = await registerDevice();
    const events = [await makeEvent({ deviceSeq: 1 }), await makeEvent({ deviceSeq: 2 })];
    const payload = JSON.stringify({ workspaceId: "ws-1", deviceId, events });

    const first = await request("/api/v1/agent/sync/push", { method: "POST", body: payload });
    expect(((await first.json()) as { accepted: number }).accepted).toBe(2);

    // Same ids and sequences: the UNIQUE (device_id, device_seq) constraint is
    // what makes a retry safe, not application bookkeeping.
    const second = await request("/api/v1/agent/sync/push", { method: "POST", body: payload });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { accepted: number }).accepted).toBe(0);
  });

  it("rejects a school record entity type", async () => {
    const deviceId = await registerDevice();
    const response = await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws-1",
        deviceId,
        events: [await makeEvent({ entityType: "students" })]
      })
    });
    expect(response.status).toBe(400);
  });

  it("rejects a corrupted payload by checksum", async () => {
    const deviceId = await registerDevice();
    const response = await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws-1",
        deviceId,
        events: [await makeEvent({ checksum: "0".repeat(64) })]
      })
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain(
      "Checksum"
    );
  });

  it("stores metadata only, never the sealed body in the payload", async () => {
    const deviceId = await registerDevice();
    const event = await makeEvent({ deviceSeq: 1 });
    await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws-1", deviceId, events: [event] })
    });

    const row = await env.AGENT_DB.prepare(
      "SELECT payload_json, ciphertext FROM sync_events WHERE id = ?"
    )
      .bind(event.id)
      .first<{ payload_json: string; ciphertext: string }>();

    expect(row).not.toBeNull();
    const metadata = JSON.parse(row!.payload_json) as Record<string, unknown>;
    expect(Object.keys(metadata).sort()).toEqual(["entityId", "entityType", "operation"]);
    // The body is ciphertext, and the metadata does not restate it.
    expect(row!.payload_json).not.toContain(row!.ciphertext);
  });
});

describe("pull", () => {
  it("returns another device's events and never echoes its own", async () => {
    const writer = await registerDevice();
    const reader = await registerDevice();
    const event = await makeEvent({ deviceSeq: 1 });

    await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws-pull", deviceId: writer, events: [event] })
    });

    const readerView = await request(
      `/api/v1/agent/sync/pull?workspaceId=ws-pull&deviceId=${reader}&cursor=`
    );
    expect(readerView.status).toBe(200);
    const body = (await readerView.json()) as {
      events: { id: string }[];
      nextCursor: string;
    };
    expect(body.events.map((entry) => entry.id)).toContain(event.id);
    expect(body.nextCursor).toMatch(/^\d+:/);
  });

  it("advances no further than the page it returned", async () => {
    const writer = await registerDevice();
    const reader = await registerDevice();

    await request("/api/v1/agent/sync/push", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws-page",
        deviceId: writer,
        events: [
          await makeEvent({ deviceSeq: 1 }),
          await makeEvent({ deviceSeq: 2 }),
          await makeEvent({ deviceSeq: 3 })
        ]
      })
    });

    const first = await request(
      `/api/v1/agent/sync/pull?workspaceId=ws-page&deviceId=${reader}&cursor=&limit=2`
    );
    const firstBody = (await first.json()) as { events: { id: string }[]; nextCursor: string };
    expect(firstBody.events).toHaveLength(2);

    const second = await request(
      `/api/v1/agent/sync/pull?workspaceId=ws-page&deviceId=${reader}&cursor=${encodeURIComponent(firstBody.nextCursor)}`
    );
    const secondBody = (await second.json()) as { events: { id: string }[] };
    expect(secondBody.events).toHaveLength(1);

    // No overlap between pages: the union is exactly the three events.
    const firstIds = firstBody.events.map((entry) => entry.id);
    const all = new Set([...firstIds, ...secondBody.events.map((entry) => entry.id)]);
    expect(all.size).toBe(3);
  });

  it("refuses a revoked device", async () => {
    const deviceId = await registerDevice();
    await request(`/api/v1/agent/devices/${deviceId}`, { method: "DELETE" });

    const response = await request(
      `/api/v1/agent/sync/pull?workspaceId=ws-1&deviceId=${deviceId}&cursor=`
    );
    expect(response.status).toBe(403);
  });

  it("validates the query", async () => {
    const deviceId = await registerDevice();
    const response = await request(
      `/api/v1/agent/sync/pull?workspaceId=ws-1&deviceId=${deviceId}&cursor=-5`
    );
    expect(response.status).toBe(400);
  });
});
