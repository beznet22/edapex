import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setAgentGrants } from "@/lib/agents-api";

/**
 * The grant editor's wire call.
 *
 * Narrowing is the whole point of the feature: a `PUT` that sends the union of old and
 * new grants, or that drops the workspace scope, widens authority without any visible
 * symptom on screen. These tests pin the request, not the rendering.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ operations: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setAgentGrants", () => {
  it("PUTs exactly the new set, not a merge with the old", async () => {
    await setAgentGrants("ws-1", "agent-9", ["get", "search"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    // A merge would leave a removed operation in the body, which is exactly how a
    // "narrowing" edit ends up widening.
    expect(JSON.parse(String(init.body))).toEqual({ operationIds: ["get", "search"] });
    expect(url).toContain("/api/v1/agent/agents/agent-9/grants");
  });

  it("scopes the request to the workspace", async () => {
    await setAgentGrants("ws-1", "agent-9", ["get"]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("workspaceId=ws-1");
  });

  it("encodes an id rather than interpolating it raw", async () => {
    // An agent id comes from the server today, but a raw interpolation is one rename
    // away from a path-traversal-shaped bug.
    await setAgentGrants("ws-1", "a/b c", ["get"]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("a%2Fb%20c");
  });

  it("surfaces the server's rejection message", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "This grant exceeds your authority." } }),
        { status: 403, headers: { "content-type": "application/json" } }
      )
    );

    await expect(setAgentGrants("ws-1", "agent-9", ["apply"])).rejects.toThrow(
      /exceeds your authority/
    );
  });

  it("times out rather than hanging forever", async () => {
    // A request that never settles would leave the dialog in "saving" with no way out.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );

    await expect(setAgentGrants("ws-1", "agent-9", ["get"])).rejects.toThrow(/timed out/i);
  }, 20_000);
});
