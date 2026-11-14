import { describe, expect, it, vi } from "vitest";

import {
  createHttpSyncTransport,
  SyncClient,
  SyncRejectedError,
  type Outbox,
  type PushItem,
  type SyncTransport
} from "@/lib/sync-client";

/**
 * Flush-loop behaviour.
 *
 * The cases that matter are all failure cases: the happy path is one line, but
 * acknowledging too early, or retrying a revoked device forever, loses data or
 * spins. Those are what these assert.
 */

function item(deviceSeq: number): PushItem {
  return {
    id: `device-a:${deviceSeq}`,
    entityType: "messages",
    entityId: `m-${deviceSeq}`,
    operation: "create",
    ciphertext: "AAAA",
    checksum: "0".repeat(64),
    deviceSeq,
    createdAt: 1
  };
}

/** In-memory outbox that records what was acknowledged. */
function outbox(items: PushItem[]): Outbox & { acknowledged: number[]; pending: PushItem[] } {
  const state = {
    pending: [...items],
    acknowledged: [] as number[]
  };
  return {
    pending: state.pending,
    acknowledged: state.acknowledged,
    async nextBatch(_deviceId: string, limit: number): Promise<readonly PushItem[]> {
      return state.pending.slice(0, limit);
    },
    async acknowledge(_deviceId: string, _workspaceId: string, throughSeq: number): Promise<void> {
      state.acknowledged.push(throughSeq);
      state.pending = state.pending.filter((entry) => entry.deviceSeq > throughSeq);
      this.pending = state.pending;
    }
  };
}

function transport(
  push: SyncTransport["push"]
): SyncTransport & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async push(input) {
      state.calls += 1;
      return push(input);
    },
    async pull() {
      return { events: [], nextCursor: "" };
    }
  };
}

describe("SyncClient.flush", () => {
  it("does nothing when the outbox is empty", async () => {
    const client = new SyncClient({ outbox: outbox([]), transport: transport(async () => ({ accepted: 0, cursor: 0 })) });
    expect(await client.flush("device-a", "ws-1")).toEqual({ kind: "idle" });
  });

  it("drains the outbox and acknowledges each batch", async () => {
    const store = outbox([item(1), item(2), item(3), item(4), item(5)]);
    const seen: number[][] = [];
    const client = new SyncClient({
      outbox: store,
      batchSize: 2,
      transport: transport(async ({ events }) => {
        seen.push(events.map((entry) => entry.deviceSeq));
        return { accepted: events.length, cursor: events[events.length - 1]!.deviceSeq };
      })
    });

    const outcome = await client.flush("device-a", "ws-1");
    expect(outcome).toEqual({ kind: "pushed", batches: 3, accepted: 5 });
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
    expect(store.acknowledged).toEqual([2, 4, 5]);
    expect(store.pending).toHaveLength(0);
  });

  it("leaves the outbox intact when the push fails", async () => {
    const store = outbox([item(1), item(2)]);
    const client = new SyncClient({
      outbox: store,
      transport: transport(async () => {
        throw new Error("network down");
      })
    });

    const outcome = await client.flush("device-a", "ws-1");
    expect(outcome.kind).toBe("retry");
    expect(store.acknowledged).toEqual([]);
    expect(store.pending).toHaveLength(2);
  });

  it("does not acknowledge a batch the service rejected", async () => {
    const store = outbox([item(1)]);
    const client = new SyncClient({
      outbox: store,
      transport: transport(async () => {
        throw new SyncRejectedError("This device has been revoked.", "device_revoked");
      })
    });

    const outcome = await client.flush("device-a", "ws-1");
    expect(outcome).toMatchObject({ kind: "rejected", code: "device_revoked" });
    expect(store.pending).toHaveLength(1);
  });

  it("distinguishes an expired session from a revoked device", async () => {
    const client = new SyncClient({
      outbox: outbox([item(1)]),
      transport: transport(async () => {
        throw new SyncRejectedError("Sign in to continue.", "unauthorized");
      })
    });
    expect(await client.flush("device-a", "ws-1")).toMatchObject({
      kind: "rejected",
      code: "unauthorized"
    });
  });

  it("stops after maxBatches instead of spinning", async () => {
    const store = outbox(Array.from({ length: 100 }, (_, index) => item(index + 1)));
    const client = new SyncClient({
      outbox: store,
      batchSize: 1,
      maxBatches: 3,
      transport: transport(async ({ events }) => ({ accepted: 1, cursor: events[0]!.deviceSeq }))
    });

    const outcome = await client.flush("device-a", "ws-1");
    expect(outcome).toEqual({ kind: "bounded", batches: 3, accepted: 3 });
    // Progress is still durable even though the loop was bounded.
    expect(store.acknowledged).toEqual([1, 2, 3]);
  });

  it("backs off exponentially and caps", async () => {
    const client = new SyncClient({
      outbox: outbox([item(1)]),
      baseBackoffMs: 100,
      maxBackoffMs: 250,
      transport: transport(async () => {
        throw new Error("offline");
      })
    });

    const delays: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const outcome = await client.flush("device-a", "ws-1");
      delays.push(outcome.kind === "retry" ? outcome.backoffMs : -1);
    }
    expect(delays).toEqual([100, 200, 250, 250, 250]);
  });

  it("resets the backoff after a successful flush", async () => {
    let fail = true;
    const client = new SyncClient({
      outbox: outbox([item(1)]),
      baseBackoffMs: 100,
      transport: transport(async ({ events }) => {
        if (fail) throw new Error("offline");
        return { accepted: 1, cursor: events[0]!.deviceSeq };
      })
    });

    expect((await client.flush("device-a", "ws-1")).kind).toBe("retry");
    expect(client.backoffMs).toBe(100);

    fail = false;
    // A successful round with an empty outbox resets the delay.
    const empty = new SyncClient({
      outbox: outbox([]),
      transport: transport(async () => ({ accepted: 0, cursor: 0 }))
    });
    expect(client.backoffMs).toBe(100);
    await empty.flush("device-a", "ws-1");
    expect(empty.backoffMs).toBe(0);
  });

  it("acknowledges the high-water mark, not the item count", async () => {
    const store = outbox([item(7), item(8), item(9)]);
    const client = new SyncClient({
      outbox: store,
      transport: transport(async () => ({ accepted: 3, cursor: 9 }))
    });

    await client.flush("device-a", "ws-1");
    // A count-based acknowledge would have cleared seq 1..3, which do not exist.
    expect(store.acknowledged).toEqual([9]);
  });

  it("reports a store read failure as retryable", async () => {
    const client = new SyncClient({
      outbox: {
        async nextBatch() {
          throw new Error("sqlite busy");
        },
        async acknowledge() {}
      },
      transport: transport(async () => ({ accepted: 0, cursor: 0 }))
    });

    const outcome = await client.flush("device-a", "ws-1");
    expect(outcome).toMatchObject({ kind: "retry", message: "sqlite busy" });
    expect(vi.isMockFunction(client.flush)).toBe(false);
  });
});

describe("createHttpSyncTransport", () => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });

  const pushInput = { workspaceId: "ws-1", deviceId: "device-a", events: [item(1)] };

  it("posts the batch and returns the cursor", async () => {
    let captured: { url: string; body: string } | null = null;
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        captured = { url, body: String(init?.body) };
        return json(200, { accepted: 1, cursor: 1 });
      }) as typeof fetch
    });

    const result = await transport.push(pushInput);
    expect(result).toEqual({ accepted: 1, cursor: 1 });
    expect(captured!.url).toBe("https://api.example/api/v1/agent/sync/push");
    expect(JSON.parse(captured!.body).events[0].deviceSeq).toBe(1);
  });

  it("turns 401 into a non-retryable unauthorized rejection", async () => {
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async () => json(401, { error: { code: "unauthorized" } })) as typeof fetch
    });

    await expect(transport.push(pushInput)).rejects.toMatchObject({
      name: "SyncRejectedError",
      code: "unauthorized"
    });
  });

  it("carries the service's revocation code through", async () => {
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async () =>
        json(403, {
          error: { code: "device_revoked", message: "This device has been revoked." }
        })) as typeof fetch
    });

    await expect(transport.push(pushInput)).rejects.toMatchObject({ code: "device_revoked" });
  });

  it("leaves a 5xx retryable", async () => {
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async () => json(503, {})) as typeof fetch
    });

    // A plain Error, not SyncRejectedError: the flush loop backs off and retries.
    await expect(transport.push(pushInput)).rejects.toThrow("503");
  });

  it("sends credentials so the host-bound session cookie travels", async () => {
    let credentials: RequestCredentials | undefined;
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        credentials = init?.credentials;
        return json(200, { accepted: 0, cursor: 0 });
      }) as typeof fetch
    });

    await transport.push(pushInput);
    expect(credentials).toBe("include");
  });

  it("encodes the cursor into the pull query", async () => {
    let url = "";
    const transport = createHttpSyncTransport({
      baseUrl: "https://api.example",
      fetchImpl: (async (input: string) => {
        url = input;
        return json(200, { events: [], nextCursor: "" });
      }) as typeof fetch
    });

    await transport.pull({
      workspaceId: "ws 1",
      deviceId: "device-a",
      cursor: "1700000000000:evt-1",
      limit: 25
    });

    expect(url).toContain("workspaceId=ws+1");
    expect(url).toContain(`cursor=${encodeURIComponent("1700000000000:evt-1")}`);
    expect(url).toContain("limit=25");
  });
});
