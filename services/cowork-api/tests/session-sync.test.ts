import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  MAX_SESSION_BYTES,
  MAX_SESSION_EVENTS,
  quotaExceeded
} from "../src/services/session-relay";
import { checksumOf } from "../src/services/sync";

/**
 * The session relay.
 *
 * These are protocol properties — one holder at a time, a fence that makes a
 * stale writer visible, idempotent push, ordered pull, a hard delete with a
 * tombstone, tenant and user scoping — so they run against the Worker rather
 * than by unit-testing helpers.
 */

const app = createApp();

async function request(
  path: string,
  init: RequestInit & { userId?: number } = {}
): Promise<Response> {
  const { userId = 1, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("cookie", `edapex_session=user-${userId}`);
  headers.set("content-type", "application/json");
  return app.request(path, { ...rest, headers }, env);
}

const workspaceId = "workspace-1";

// Each test gets its own session: a lease outlives a test, and sharing one id
// would make every later acquire answer `lease_held` for the wrong reason.
let sessionId = "session-root-1";
beforeEach(() => {
  sessionId = `session-${crypto.randomUUID()}`;
});

const commandsPath = () => `/api/v1/agent/sessions/${sessionId}/commands?workspaceId=${workspaceId}`;
const eventsPath = (query: string) =>
  `/api/v1/agent/sessions/${sessionId}/events?workspaceId=${workspaceId}${query}`;

function commandBody(type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type,
    commandId: `command-${type}`,
    sessionId,
    clientId: "client-a",
    ...extra
  });
}

async function acquire(
  clientId: string,
  ttlMs = 60_000
): Promise<Response> {
  return request(commandsPath(), {
    method: "POST",
    body: JSON.stringify({
      type: "acquire_lease",
      commandId: `acquire-${clientId}`,
      sessionId,
      clientId,
      leaseTtlMs: ttlMs
    })
  });
}

async function event(deviceSeq: number, text = "AQID") {
  return {
    eventId: `event-${deviceSeq}`,
    sessionId,
    deviceId: "device-1",
    deviceSeq,
    kind: "projection" as const,
    ciphertext: text,
    checksum: await checksumOf(text),
    createdAtMs: 1_770_000_000_000 + deviceSeq,
    relayPosition: null
  };
}

async function push(
  fence: number,
  events: Awaited<ReturnType<typeof event>>[],
  clientId = "client-a",
  deviceId = "device-1"
): Promise<Response> {
  return request(eventsPath(""), {
    method: "POST",
    body: JSON.stringify({ workspaceId, sessionId, deviceId, clientId, fence, events })
  });
}

describe("session relay", () => {
  it("grants one holder at a time and advances the fence across holders", async () => {
    const first = await acquire("client-a");
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { lease: { fence: number } };
    expect(firstBody.lease.fence).toBe(1);

    const rival = await acquire("client-b");
    expect(rival.status).toBe(409);
    expect(((await rival.json()) as { error: { code: string } }).error.code).toBe("lease_held");

    const released = await request(commandsPath(), {
      method: "POST",
      body: JSON.stringify({
        type: "release_lease",
        commandId: "release-1",
        sessionId,
        clientId: "client-a",
        expectedFence: firstBody.lease.fence
      })
    });
    expect(released.status).toBe(200);
    expect(await released.json()).toEqual({ released: true });

    // The fence never restarts: a stale writer must stay recognisable.
    const second = await acquire("client-b");
    const secondBody = (await second.json()) as { lease: { fence: number } };
    expect(secondBody.lease.fence).toBe(2);
  });

  it("accepts a batch in order, answers a retry as duplicate and refuses a stale fence", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    const events = [await event(1), await event(2)];

    const accepted = await push(lease.lease.fence, events);
    expect(accepted.status).toBe(200);
    const result = (await accepted.json()) as {
      acknowledgements: { status: string; position: number | null }[];
      nextPosition: number;
    };
    expect(result.acknowledgements.map((ack) => ack.status)).toEqual(["accepted", "accepted"]);
    expect(result.acknowledgements.map((ack) => ack.position)).toEqual([1, 2]);
    expect(result.nextPosition).toBe(2);

    const retried = await push(lease.lease.fence, events);
    const retriedBody = (await retried.json()) as {
      acknowledgements: { status: string }[];
    };
    expect(retriedBody.acknowledgements.map((ack) => ack.status)).toEqual([
      "duplicate",
      "duplicate"
    ]);

    // A re-acquire advances the fence, so the old one must accept nothing.
    const newer = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    const stale = await push(lease.lease.fence, [await event(3)]);
    const staleBody = (await stale.json()) as {
      acknowledgements: { status: string }[];
      nextPosition: number;
    };
    expect(staleBody.acknowledgements[0]?.status).toBe("stale");
    expect(staleBody.nextPosition).toBe(2);

    const current = await push(newer.lease.fence, [await event(3)]);
    expect(((await current.json()) as { nextPosition: number }).nextPosition).toBe(3);
  });

  it("rejects a body whose checksum does not match its ciphertext", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    const tampered = { ...(await event(9)), checksum: "0".repeat(64) };
    const response = await push(lease.lease.fence, [tampered]);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_request"
    );
  });

  it("pulls only what follows the cursor and reports the tombstone", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    await push(lease.lease.fence, [await event(1), await event(2), await event(3)]);

    const first = await request(eventsPath("&after=0&limit=2"));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      events: { relayPosition: number }[];
      nextPosition: number;
      deletion: unknown;
    };
    expect(firstBody.events.map((item) => item.relayPosition)).toEqual([1, 2]);
    expect(firstBody.nextPosition).toBe(2);
    expect(firstBody.deletion).toBeNull();

    const rest = await request(eventsPath("&after=2"));
    const restBody = (await rest.json()) as {
      events: { relayPosition: number }[];
      nextPosition: number;
    };
    expect(restBody.events.map((item) => item.relayPosition)).toEqual([3]);
    expect(restBody.nextPosition).toBe(3);
  });

  it("hard-deletes the payloads and leaves a tombstone a puller can see", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    await push(lease.lease.fence, [await event(1)]);

    const deleted = await request(commandsPath(), {
      method: "POST",
      body: commandBody("delete_session", { clientId: "client-a" })
    });
    expect(deleted.status).toBe(200);
    const deletion = (await deleted.json()) as {
      sessionId: string;
      deletionEventId: string;
      position: number;
    };
    expect(deletion.sessionId).toBe(sessionId);
    expect(deletion.deletionEventId).toBe("command-delete_session");
    expect(deletion.position).toBe(2);

    const pull = await request(eventsPath("&after=0"));
    const pullBody = (await pull.json()) as {
      events: unknown[];
      deletion: { deletionEventId: string } | null;
    };
    expect(pullBody.events).toEqual([]);
    expect(pullBody.deletion?.deletionEventId).toBe("command-delete_session");

    const afterDelete = await push(lease.lease.fence, [await event(2)]);
    expect(afterDelete.status).toBe(410);
    expect(((await afterDelete.json()) as { error: { code: string } }).error.code).toBe(
      "session_deleted"
    );
  });

  it("scopes a session to its user and workspace", async () => {
    await acquire("client-a");

    const otherWorkspace = await request(
      `/api/v1/agent/sessions/${sessionId}/events?workspaceId=workspace-2&after=0`
    );
    expect(otherWorkspace.status).toBe(403);
    expect(
      ((await otherWorkspace.json()) as { error: { code: string } }).error.code
    ).toBe("workspace_mismatch");

    // Another account must not learn that the session exists at all.
    const otherUser = await request(eventsPath("&after=0"), { userId: 2 });
    expect(otherUser.status).toBe(404);
    expect(((await otherUser.json()) as { error: { code: string } }).error.code).toBe(
      "session_unknown"
    );
  });

  it("refuses a command the lease holder executes locally", async () => {
    const response = await request(commandsPath(), {
      method: "POST",
      body: commandBody("enqueue_text", {
        threadId: sessionId,
        dedupId: "dedup-1",
        text: "hello"
      })
    });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_request"
    );
  });

  it("settles concurrent acquires on exactly one holder", async () => {
    const [first, second] = await Promise.all([acquire("client-a"), acquire("client-b")]);
    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([200, 409]);
  });

  it("lets a second device take over only after the lease expires", async () => {
    const first = (await (await acquire("client-a", 1)).json()) as {
      lease: { fence: number };
    };
    await new Promise((resolve) => setTimeout(resolve, 5));

    const takeover = await acquire("client-b");
    expect(takeover.status).toBe(200);
    const second = (await takeover.json()) as { lease: { fence: number } };
    // The fence advances across the takeover, which is what makes the old one stale.
    expect(second.lease.fence).toBe(first.lease.fence + 1);

    const late = await push(first.lease.fence, [await event(1)], "client-a");
    const body = (await late.json()) as { acknowledgements: { status: string }[] };
    expect(body.acknowledgements[0]?.status).toBe("stale");
  });

  it("renews only with the fence it was granted", async () => {
    const lease = (await (await acquire("client-a")).json()) as {
      lease: { fence: number; expiresAtMs: number };
    };
    const renewed = await request(commandsPath(), {
      method: "POST",
      body: JSON.stringify({
        type: "renew_lease",
        commandId: "renew-1",
        sessionId,
        clientId: "client-a",
        expectedFence: lease.lease.fence
      })
    });
    expect(renewed.status).toBe(200);
    const renewedBody = (await renewed.json()) as {
      lease: { fence: number; expiresAtMs: number };
    };
    expect(renewedBody.lease.fence).toBe(lease.lease.fence);
    expect(renewedBody.lease.expiresAtMs).toBeGreaterThanOrEqual(lease.lease.expiresAtMs);

    const wrong = await request(commandsPath(), {
      method: "POST",
      body: JSON.stringify({
        type: "renew_lease",
        commandId: "renew-2",
        sessionId,
        clientId: "client-a",
        expectedFence: lease.lease.fence + 1
      })
    });
    expect(wrong.status).toBe(409);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe("lease_stale");
  });

  it("refuses a batch above the contract limit", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    const events = await Promise.all(
      Array.from({ length: 101 }, (_, index) => event(index + 1))
    );
    const response = await push(lease.lease.fence, events);
    expect(response.status).toBe(400);
  });

  it("pages a whole backlog without gaps or duplicates", async () => {
    const lease = (await (await acquire("client-a")).json()) as { lease: { fence: number } };
    await push(
      lease.lease.fence,
      await Promise.all(Array.from({ length: 5 }, (_, index) => event(index + 1)))
    );

    const positions: number[] = [];
    let cursor = 0;
    for (;;) {
      const page = await request(eventsPath(`&after=${cursor}&limit=2`));
      const body = (await page.json()) as {
        events: { relayPosition: number }[];
        nextPosition: number;
      };
      if (body.events.length === 0) break;
      positions.push(...body.events.map((item) => item.relayPosition));
      cursor = body.nextPosition;
    }
    expect(positions).toEqual([1, 2, 3, 4, 5]);
  });

  it("computes its quota at the boundary, not past it", () => {
    expect(quotaExceeded({ eventCount: MAX_SESSION_EVENTS, payloadBytes: 0 }, 1, 0)).toBe(true);
    expect(quotaExceeded({ eventCount: MAX_SESSION_EVENTS - 1, payloadBytes: 0 }, 1, 0)).toBe(false);
    expect(quotaExceeded({ eventCount: 0, payloadBytes: MAX_SESSION_BYTES }, 1, 1)).toBe(true);
    expect(quotaExceeded({ eventCount: 0, payloadBytes: MAX_SESSION_BYTES - 1 }, 1, 1)).toBe(false);
  });
});
