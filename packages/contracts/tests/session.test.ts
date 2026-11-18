import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { agentEventSchema } from "../src/agent";
import { CAPABILITY_ERROR_CODES } from "../src/platform";
import {
  isSessionCommand,
  isSessionView,
  sessionCommandSchema,
  sessionDeletionResultSchema,
  sessionLeaseResultSchema,
  sessionReleaseResultSchema,
  sessionSyncPullResultSchema,
  sessionSyncPushSchema,
  sessionSyncPushResultSchema,
  sessionViewSchema
} from "../src/session";

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

const syncFixtureSchema = z
  .object({
    push: sessionSyncPushSchema,
    pushResult: sessionSyncPushResultSchema,
    pullResult: sessionSyncPullResultSchema,
    leaseResult: sessionLeaseResultSchema,
    released: sessionReleaseResultSchema,
    deletionResult: sessionDeletionResultSchema
  })
  .strict();

describe("session wire contracts", () => {
  it("round-trips a view and pins the durable root identity", () => {
    const value = readFixture("session-view.json");
    const view = sessionViewSchema.parse(value);
    expect(view).toEqual(value);
    expect(isSessionView(view)).toBe(true);
    expect(view.sessionId).toBe(view.threadId);
    expect(view.messages[0]?.messageId).toBe("core-message-2");
    expect(view.queue[0]?.dedupId).toBe("dedup-4");
    expect(sessionViewSchema.safeParse({ ...view, threadId: "another-thread" }).success).toBe(
      false
    );
  });

  it("round-trips every command variant", () => {
    const fixtures = readFixture("session-commands.json");
    const commands = z.array(sessionCommandSchema).parse(fixtures);
    expect(commands).toEqual(fixtures);
    expect(new Set(commands.map((command) => command.type))).toEqual(
      new Set([
        "enqueue_text",
        "cancel_turn",
        "edit_message",
        "truncate",
        "restore",
        "delete_session",
        "acquire_lease",
        "renew_lease",
        "release_lease"
      ])
    );
    expect(commands.every(isSessionCommand)).toBe(true);
  });

  it("round-trips encrypted sync, retry acknowledgement and deletion envelopes", () => {
    const value = readFixture("session-sync.json");
    const fixture = syncFixtureSchema.parse(value);
    expect(fixture).toEqual(value);
    expect(fixture.push.events).toHaveLength(2);
    expect(fixture.pushResult.acknowledgements.map((ack) => ack.status)).toEqual([
      "accepted",
      "duplicate",
      "stale"
    ]);
    expect(fixture.pullResult.deletion?.sessionId).toBe(fixture.push.sessionId);
  });

  it("requires a server-assigned positive fence and a tombstone position", () => {
    const { leaseResult, released, deletionResult } = syncFixtureSchema.parse(
      readFixture("session-sync.json")
    );
    const first = leaseResult.lease;
    expect(first.fence).toBeGreaterThan(0);
    // The fence is the server's; zero or negative would let a stale writer look current.
    expect(sessionLeaseResultSchema.safeParse({ lease: { ...first, fence: 0 } }).success).toBe(
      false
    );
    expect(released.released).toBe(true);
    // A puller resumes after the tombstone, so it must sit beyond every lease fence.
    expect(deletionResult.position).toBeGreaterThan(first.fence);
  });

  it("rejects forged relay positions and cross-session/device push events", () => {
    const { push } = syncFixtureSchema.parse(readFixture("session-sync.json"));
    const first = push.events[0];
    if (first === undefined) throw new Error("missing push event fixture");
    expect(
      sessionSyncPushSchema.safeParse({
        ...push,
        events: [{ ...first, relayPosition: 40 }]
      }).success
    ).toBe(false);
    expect(
      sessionSyncPushSchema.safeParse({
        ...push,
        events: [{ ...first, sessionId: "another-session" }]
      }).success
    ).toBe(false);
    expect(
      sessionSyncPushSchema.safeParse({
        ...push,
        events: [{ ...first, deviceId: "another-device" }]
      }).success
    ).toBe(false);
  });

  it("accepts a guarded session snapshot alongside existing agent events", () => {
    const fixtures = readFixture("agent-events.json");
    const events = z.array(agentEventSchema).parse(fixtures);
    const snapshot = events.find((event) => event.type === "session_snapshot");
    expect(snapshot?.type).toBe("session_snapshot");
    if (snapshot?.type !== "session_snapshot") throw new Error("missing session snapshot");
    expect(isSessionView(snapshot.view)).toBe(true);
  });

  it("publishes typed storage, ownership, sync and deletion failures", () => {
    expect(CAPABILITY_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "storage_unavailable",
        "storage_corrupted",
        "lease_lost",
        "sync_unavailable",
        "session_deleted"
      ])
    );
  });
});
