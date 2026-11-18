import { describe, expect, it } from "vitest";

import type { RelayRequest } from "../src/sync/relay-client";
import {
  createFetchTransport,
  createInvokeTransport,
  type FetchLikeInit
} from "../src/sync/transports";

/**
 * The two transports, as boundaries.
 *
 * What matters here is what crosses to the platform: the web must send cookies
 * and nothing else, the native side must go through the status-bearing command,
 * and neither may smuggle a credential through `@edapex/host`.
 */

interface Captured {
  readonly url: string;
  readonly init: FetchLikeInit;
}

function fetchStub(status: number, body: unknown): {
  transport: ReturnType<typeof createFetchTransport>;
  captured: Captured[];
} {
  const captured: Captured[] = [];
  const transport = createFetchTransport(async (url, init) => {
    captured.push({ url, init });
    return {
      status,
      json: async () => body
    };
  }, "https://api.test");
  return { transport, captured };
}

describe("relay transports", () => {
  it("sends cookies and no body for a GET", async () => {
    const { transport, captured } = fetchStub(200, { events: [] });
    const request: RelayRequest = {
      method: "GET",
      path: "/api/v1/agent/sessions/s/events?after=0"
    };

    const response = await transport(request);

    expect(response).toEqual({ status: 200, body: { events: [] } });
    const call = captured[0];
    expect(call?.url).toBe("https://api.test/api/v1/agent/sessions/s/events?after=0");
    expect(call?.init.credentials).toBe("include");
    expect(call?.init.body).toBeUndefined();
    expect(call?.init.headers).toBeUndefined();
  });

  it("posts JSON and keeps the status, including a rejection", async () => {
    const { transport, captured } = fetchStub(409, { error: { code: "lease_held" } });
    const request: RelayRequest = {
      method: "POST",
      path: "/api/v1/agent/sessions/s/events",
      body: { fence: 2 }
    };

    const response = await transport(request);

    expect(response.status).toBe(409);
    expect(captured[0]?.init.headers).toEqual({ "content-type": "application/json" });
    expect(captured[0]?.init.body).toBe(JSON.stringify({ fence: 2 }));
  });

  it("tolerates a response with no JSON body", async () => {
    const transport = createFetchTransport(async () => ({
      status: 204,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      }
    }));

    await expect(transport({ method: "POST", path: "/x", body: {} })).resolves.toEqual({
      status: 204,
      body: null
    });
  });

  it("routes the native transport through the status-bearing command", async () => {
    const calls: { command: string; args: Record<string, unknown> }[] = [];
    const transport = createInvokeTransport(async (command, args) => {
      calls.push({ command, args });
      return { status: 410, body: { error: { code: "session_deleted" } } };
    });

    const response = await transport({
      method: "POST",
      path: "/api/v1/agent/sessions/s/events",
      body: { fence: 1 }
    });

    expect(calls).toEqual([
      {
        command: "relay_request",
        args: { method: "POST", path: "/api/v1/agent/sessions/s/events", body: { fence: 1 } }
      }
    ]);
    expect(response).toEqual({ status: 410, body: { error: { code: "session_deleted" } } });
  });

  it("rejects a native reply with the wrong shape instead of guessing", async () => {
    const transport = createInvokeTransport(async () => ({ ok: true }));

    await expect(transport({ method: "GET", path: "/api/v1/agent/sessions/s/events" })).rejects.toThrow(
      "unexpected shape"
    );
  });
});

describe("event routing", () => {
  it("keeps transcript, model context and tombstones apart", async () => {
    const { splitEvents } = await import("../src/sync/events");
    const base = {
      sessionId: "s",
      deviceId: "d",
      ciphertext: "AQID",
      checksum: "0".repeat(64),
      createdAtMs: 1,
      relayPosition: 1
    };
    const split = splitEvents([
      { ...base, eventId: "p", deviceSeq: 1, kind: "projection" },
      { ...base, eventId: "c", deviceSeq: 2, kind: "core_snapshot" },
      { ...base, eventId: "x", deviceSeq: 3, kind: "deletion" }
    ]);

    expect(split.transcript.map((event) => event.eventId)).toEqual(["p"]);
    expect(split.modelContext.map((event) => event.eventId)).toEqual(["c"]);
    expect(split.tombstones.map((event) => event.eventId)).toEqual(["x"]);
  });
});
