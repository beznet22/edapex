import type {
  SessionDeletion,
  SessionLease,
  SessionSyncAcknowledgement,
  SessionSyncEvent,
  SessionSyncPullResult,
  SessionSyncPush
} from "@edapex/contracts";
import { describe, expect, it } from "vitest";

import { LeaseKeeper } from "../src/sync/lease-keeper";
import { syncOnce, type SessionSyncStore } from "../src/sync/pass";
import {
  RelayError,
  SessionRelayClient,
  type RelayRequest,
  type RelayResponse,
  type RelayTransport
} from "../src/sync/relay-client";

/**
 * The sync pass, against a scripted relay.
 *
 * These are state-machine properties — one lease across passes, one retry after
 * a takeover, no infinite retry, tombstones stop the pull — so they run against
 * a transport that records what was asked rather than a live Worker.
 */

const SESSION = "session-1";
const WORKSPACE = "workspace-1";
const DEVICE = "device-1";
const CLIENT = "client-a";

interface RelayScript {
  acquire?: (count: number) => RelayResponse;
  renew?: (count: number) => RelayResponse;
  release?: () => RelayResponse;
  push?: (body: SessionSyncPush, count: number) => RelayResponse;
  pull?: (after: number, limit: number, count: number) => RelayResponse;
}

interface Recorded {
  readonly calls: RelayRequest[];
  readonly counts: { acquire: number; renew: number; push: number; pull: number };
}

function leaseResponse(fence: number, expiresAtMs = 60_000): RelayResponse {
  const lease: SessionLease = { sessionId: SESSION, holderId: CLIENT, fence, expiresAtMs };
  return { status: 200, body: { lease } };
}

function acceptedResponse(
  body: SessionSyncPush,
  positions: (eventId: string) => number | null
): RelayResponse {
  return {
    status: 200,
    body: {
      acknowledgements: body.events.map((event) => {
        const position = positions(event.eventId);
        return position === null
          ? { eventId: event.eventId, status: "duplicate", position: null }
          : { eventId: event.eventId, status: "accepted", position };
      }),
      nextPosition: Math.max(0, ...body.events.map((event) => positions(event.eventId) ?? 0))
    }
  };
}

function relay(script: RelayScript = {}): { transport: RelayTransport; recorded: Recorded } {
  const calls: RelayRequest[] = [];
  const counts = { acquire: 0, renew: 0, push: 0, pull: 0 };

  const transport: RelayTransport = async (request) => {
    calls.push(request);
    const url = new URL(request.path, "http://relay.test");
    const body = request.body as { type?: string } | undefined;

    if (url.pathname.endsWith("/commands")) {
      if (body?.type === "acquire_lease") {
        counts.acquire += 1;
        return (script.acquire ?? (() => leaseResponse(counts.acquire)))(counts.acquire);
      }
      if (body?.type === "renew_lease") {
        counts.renew += 1;
        return (script.renew ?? (() => leaseResponse(1)))(counts.renew);
      }
      if (body?.type === "release_lease") {
        return (script.release ?? (() => ({ status: 200, body: { released: true } })))();
      }
      return { status: 400, body: { error: { code: "invalid_request", message: "unsupported" } } };
    }
    if (url.pathname.endsWith("/events") && request.method === "POST") {
      counts.push += 1;
      const push = request.body as SessionSyncPush;
      return (script.push ?? ((value: SessionSyncPush) => acceptedResponse(value, () => 1)))(
        push,
        counts.push
      );
    }
    if (url.pathname.endsWith("/events")) {
      counts.pull += 1;
      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      return (
        script.pull ??
        ((): RelayResponse => ({
          status: 200,
          body: { events: [], nextPosition: after, deletion: null }
        }))
      )(after, limit, counts.pull);
    }
    return { status: 404, body: { error: { code: "session_unknown", message: "no route" } } };
  };

  return { transport, recorded: { calls, counts } };
}

class FakeStore implements SessionSyncStore {
  pending: SessionSyncEvent[] = [];
  applied: SessionSyncEvent[] = [];
  deletion: SessionDeletion | null = null;
  cursorValue = 0;
  failApply = false;
  failCursor = false;
  readonly acknowledged: SessionSyncAcknowledgement[] = [];

  async pendingEvents(limit: number): Promise<readonly SessionSyncEvent[]> {
    return this.pending.slice(0, limit);
  }

  async acknowledge(acks: readonly SessionSyncAcknowledgement[]): Promise<void> {
    this.acknowledged.push(...acks);
    for (const ack of acks) {
      // A stale acknowledgement deliberately leaves the event pending.
      if (ack.status !== "stale") {
        this.pending = this.pending.filter((event) => event.eventId !== ack.eventId);
      }
    }
  }

  async cursor(): Promise<number> {
    return this.cursorValue;
  }

  async applyEvents(events: readonly SessionSyncEvent[]): Promise<void> {
    if (this.failApply) throw new Error("projection is locked");
    this.applied.push(...events);
  }

  async applyDeletion(deletion: SessionDeletion): Promise<void> {
    this.deletion = deletion;
    this.pending = [];
  }

  async setCursor(position: number): Promise<void> {
    if (this.failCursor) throw new Error("cursor write failed");
    this.cursorValue = position;
  }
}

function event(seq: number, overrides: Partial<SessionSyncEvent> = {}): SessionSyncEvent {
  return {
    eventId: `event-${seq}`,
    sessionId: SESSION,
    deviceId: DEVICE,
    deviceSeq: seq,
    kind: "projection",
    ciphertext: "AQID",
    checksum: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    createdAtMs: 1_770_000_000_000 + seq,
    relayPosition: null,
    ...overrides
  };
}

function client(transport: RelayTransport): SessionRelayClient {
  return new SessionRelayClient({
    transport,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    deviceId: DEVICE,
    clientId: CLIENT,
    newCommandId: () => "command-1"
  });
}

describe("session sync pass", () => {
  it("pushes pending work, applies remote events and advances the cursor", async () => {
    const remote = [event(1, { relayPosition: 1 }), event(2, { relayPosition: 2 })];
    const wired = relay({
      pull: (after) =>
        after === 0
          ? { status: 200, body: { events: remote, nextPosition: 2, deletion: null } }
          : { status: 200, body: { events: [], nextPosition: after, deletion: null } }
    });
    const store = new FakeStore();
    store.pending = [event(3)];
    const lease = new LeaseKeeper(client(wired.transport), 60_000, () => 0);

    const report = await syncOnce({ client: client(wired.transport), lease, store });

    expect(report).toEqual({ pushed: 1, pulled: 2, deleted: false, cursor: 2 });
    expect(store.applied.map((item) => item.eventId)).toEqual(["event-1", "event-2"]);
    expect(store.pending).toHaveLength(0);
    expect(store.cursorValue).toBe(2);
  });

  it("clears a duplicate without counting it as pushed", async () => {
    const wired = relay({ push: (body) => acceptedResponse(body, () => null) });
    const store = new FakeStore();
    store.pending = [event(1)];
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    const report = await syncOnce({ client: relayClient, lease, store });

    expect(report.pushed).toBe(0);
    expect(store.pending).toHaveLength(0);
    expect(store.acknowledged[0]?.status).toBe("duplicate");
  });

  it("re-acquires once when the relay answers stale, then succeeds", async () => {
    const wired = relay({
      push: (body, count) =>
        count === 1
          ? {
              status: 200,
              body: {
                acknowledgements: body.events.map((item) => ({
                  eventId: item.eventId,
                  status: "stale",
                  position: null
                })),
                nextPosition: 0
              }
            }
          : acceptedResponse(body, () => 1)
    });
    const store = new FakeStore();
    store.pending = [event(1)];
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    const report = await syncOnce({ client: relayClient, lease, store });

    expect(report.pushed).toBe(1);
    expect(wired.recorded.counts.acquire).toBe(2);
  });

  it("refuses to retry a lost lease forever", async () => {
    const wired = relay({
      push: (body) => ({
        status: 200,
        body: {
          acknowledgements: body.events.map((item) => ({
            eventId: item.eventId,
            status: "stale",
            position: null
          })),
          nextPosition: 0
        }
      })
    });
    const store = new FakeStore();
    store.pending = [event(1)];
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    await expect(syncOnce({ client: relayClient, lease, store })).rejects.toMatchObject({
      code: "lease_stale"
    });
    expect(wired.recorded.counts.push).toBe(2);
  });

  it("applies a tombstone and stops pulling", async () => {
    const wired = relay({
      pull: () => ({
        status: 200,
        body: {
          events: [],
          nextPosition: 9,
          deletion: { sessionId: SESSION, deletionEventId: "delete-1", deletedAtMs: 1_770_000_000_500 }
        }
      })
    });
    const store = new FakeStore();
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    const report = await syncOnce({ client: relayClient, lease, store });

    expect(report.deleted).toBe(true);
    expect(report.cursor).toBe(9);
    expect(store.deletion?.deletionEventId).toBe("delete-1");
    expect(wired.recorded.counts.pull).toBe(1);
  });

  it("keeps one lease across passes until it is near expiry", async () => {
    // The stub must honour the TTL, or "near expiry" never arrives.
    const wired = relay({
      acquire: (count) => leaseResponse(count, 3_000),
      renew: () => leaseResponse(1, 5_500)
    });
    const relayClient = client(wired.transport);
    let now = 0;
    const lease = new LeaseKeeper(relayClient, 3_000, () => now);

    const work = () => {
      const store = new FakeStore();
      store.pending = [event(1)];
      return store;
    };
    await syncOnce({ client: relayClient, lease, store: work() });
    await syncOnce({ client: relayClient, lease, store: work() });
    expect(wired.recorded.counts.acquire).toBe(1);
    expect(wired.recorded.counts.renew).toBe(0);

    // Inside the last third of the TTL the keeper renews rather than re-acquiring.
    now = 2_500;
    await syncOnce({ client: relayClient, lease, store: work() });
    expect(wired.recorded.counts.renew).toBe(1);
    expect(wired.recorded.counts.acquire).toBe(1);
  });

  it("rejects a relay response that does not match the contract", async () => {
    const wired = relay({ pull: () => ({ status: 200, body: { events: "nope" } }) });
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    await expect(
      syncOnce({ client: relayClient, lease, store: new FakeStore() })
    ).rejects.toBeInstanceOf(RelayError);
    await expect(
      syncOnce({ client: relayClient, lease, store: new FakeStore() })
    ).rejects.toMatchObject({ code: "contract_mismatch" });
  });

  it("renews mid-pass when one batch outlives the renewal window", async () => {
    let now = 0;
    let pushes = 0;
    const wired = relay({
      acquire: (count) => leaseResponse(count, 3_000),
      renew: () => leaseResponse(1, 8_500),
      push: (body) => {
        pushes += 1;
        // The first batch took long enough to open the renewal window.
        if (pushes === 1) now = 2_500;
        return acceptedResponse(body, () => 1);
      }
    });
    const store = new FakeStore();
    store.pending = [event(1), event(2)];
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 3_000, () => now);

    const report = await syncOnce({ client: relayClient, lease, store, batchLimit: 1 });

    expect(report.pushed).toBe(2);
    expect(wired.recorded.counts.renew).toBe(1);
    expect(wired.recorded.counts.acquire).toBe(1);
  });

  it("does not advance the cursor when local application fails", async () => {
    const wired = relay({
      pull: () => ({
        status: 200,
        body: { events: [event(1, { relayPosition: 1 })], nextPosition: 1, deletion: null }
      })
    });
    const store = new FakeStore();
    store.failApply = true;
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    await expect(syncOnce({ client: relayClient, lease, store })).rejects.toThrow(
      "projection is locked"
    );
    expect(store.cursorValue).toBe(0);
  });

  it("replays the page when the cursor write fails, before advancing it", async () => {
    const wired = relay({
      pull: (after) =>
        after === 0
          ? {
              status: 200,
              body: { events: [event(1, { relayPosition: 1 })], nextPosition: 1, deletion: null }
            }
          : { status: 200, body: { events: [], nextPosition: after, deletion: null } }
    });
    const store = new FakeStore();
    store.failCursor = true;
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    await expect(syncOnce({ client: relayClient, lease, store })).rejects.toThrow(
      "cursor write failed"
    );
    // The page was applied and not lost; the cursor is what failed.
    expect(store.applied).toHaveLength(1);
    expect(store.cursorValue).toBe(0);

    // Second pass replays it, because the cursor never advanced. This is why
    // `applyEvents` must be idempotent by eventId.
    store.failCursor = false;
    const second = await syncOnce({ client: relayClient, lease, store });
    expect(second.cursor).toBe(1);
    expect(store.applied).toHaveLength(2);
  });

  it("reports a transport failure as a typed relay error", async () => {
    const transport: RelayTransport = async () => {
      throw new Error("offline");
    };
    const relayClient = new SessionRelayClient({
      transport,
      workspaceId: WORKSPACE,
      sessionId: SESSION,
      deviceId: DEVICE,
      clientId: CLIENT,
      newCommandId: () => "command-1"
    });

    await expect(relayClient.pull(0, 100)).rejects.toMatchObject({
      code: "transport_unavailable",
      status: 0
    });
  });

  it("keeps the transport boundary credential-safe and host-agnostic", async () => {
    const wired = relay();
    const store = new FakeStore();
    store.pending = [event(1)];
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);

    await syncOnce({ client: relayClient, lease, store });

    // Nothing but method, path and body crosses the seam: no headers, no token,
    // no origin. Each host decides how the request is authenticated.
    expect(wired.recorded.calls.length).toBeGreaterThan(0);
    for (const call of wired.recorded.calls) {
      expect(Object.keys(call).every((key) => ["method", "path", "body"].includes(key))).toBe(true);
      expect(call.path.startsWith("/api/v1/agent/sessions/")).toBe(true);
    }
  });

  it("surfaces a refused lease as a typed failure, not a silent no-op", async () => {
    const wired = relay({
      acquire: () => ({
        status: 409,
        body: { error: { code: "lease_held", message: "Another client holds this session." } }
      })
    });
    const relayClient = client(wired.transport);
    const lease = new LeaseKeeper(relayClient, 60_000, () => 0);
    const store = new FakeStore();
    store.pending = [event(1)];

    await expect(syncOnce({ client: relayClient, lease, store })).rejects.toMatchObject({
      code: "lease_held",
      status: 409
    });
  });
});
