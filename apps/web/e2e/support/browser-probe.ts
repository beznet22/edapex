import type { Page, Route } from "@playwright/test";

/**
 * Drives the real browser runtime from a spec.
 *
 * The client module is imported inside the page because it lives in the served
 * app, not in the test bundle. Only the model endpoint is mocked: the worker,
 * the Web Lock, OPFS SQLite and the Infinity session are the real thing.
 */

export const BROWSER_MODULE = "/lib/infinity-browser-client.ts";
export const MODEL = "**/api/v1/agent/model/chat/completions";
export const ANSWER = "Durable browser answer";

/** One event as the page received it, with the fields the contract requires. */
export interface ProbeEvent {
  readonly type: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly status?: string;
  readonly code?: string;
}

export interface ProbeResult {
  readonly owned: boolean;
  readonly code: string | null;
  readonly view: string | null;
  readonly chat: string[];
  readonly completed: boolean;
  /** True only when `startTurn` resolved, so a spec cannot assert a turn that was never sent. */
  readonly submitted: boolean;
  readonly trace: string;
  readonly fts: boolean;
  readonly seen: string[];
  readonly events: ProbeEvent[];
}

export interface ProbeOptions {
  send?: boolean;
  resume?: boolean;
  /** Calls `stop()` shortly after the turn is accepted, to test interruption. */
  stopAfterStart?: boolean;
  expectText?: string;
  timeoutMs?: number;
}

export async function mockModel(route: Route): Promise<void> {
  const chunk = JSON.stringify({ choices: [{ delta: { role: "assistant", content: ANSWER } }] });
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream" },
    body: `data: ${chunk}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`
  });
}

export async function probe(
  page: Page,
  workspaceId: string,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  return page.evaluate(
    async ({ modulePath, workspaceId, send, resume, stopAfterStart, expectText, timeoutMs }) => {
      // The workspace route connects a client of its own, so a probe reusing the
      // same identity would compete with the app it runs inside. A fresh identity
      // isolates it; `resume` keeps the identity to test an existing session.
      if (!resume) localStorage.setItem(`edapex.infinity.thread.${workspaceId}`, crypto.randomUUID());
      const { InfinityBrowserClient }: {
        InfinityBrowserClient: typeof import("../../lib/infinity-browser-client").InfinityBrowserClient;
      } = await import(modulePath);

      const chat: string[] = [];
      const seen: string[] = [];
      const events: { type: string; threadId?: string; turnId?: string; status?: string; code?: string }[] = [];
      let view: string | null = null;

      const client = new InfinityBrowserClient(
        { workspaceId, model: "test-model", mobileSafeTools: false },
        {
          onEvent: (event) => {
            seen.push(event.type);
            events.push({
              type: event.type,
              ...("threadId" in event && typeof event.threadId === "string" ? { threadId: event.threadId } : {}),
              ...("turnId" in event && typeof event.turnId === "string" ? { turnId: event.turnId } : {}),
              ...("status" in event && typeof event.status === "string" ? { status: event.status } : {}),
              ...(event.type === "error" ? { code: event.error.code } : {})
            });
            if (event.type === "session_snapshot") {
              view = JSON.stringify(event.view.messages.map((message) => message.text));
            }
            if (event.type === "message_delta") chat.push(event.delta);
          },
          onTool: async () => ({ success: true, text: "no tool requested" }),
          onApproval: async () => true
        }
      );

      const outcome = await client.connect();
      let completed = false;
      let submitted = false;
      if (outcome.owned && send === true) {
        await client.startTurn("Hello from the browser");
        submitted = true;
        if (stopAfterStart === true) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await client.stop();
        }
        const deadline = Date.now() + timeoutMs;
        const settled = () =>
          events.some((event) => event.type === "turn_completed" || event.type === "error");
        while (
          !chat.join("").includes(expectText) &&
          !settled() &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        completed = chat.join("").includes(expectText);
      }
      // Before `dispose`: shutdown closes the worker, so diagnostics are unreadable after.
      const diagnostics = await client.debugDiagnostics().catch(() => ({ trace: "[]", fts: false }));
      await client.dispose().catch(() => undefined);
      return {
        owned: outcome.owned,
        code: outcome.failure?.code ?? null,
        view,
        chat,
        completed,
        submitted,
        trace: diagnostics.trace,
        fts: diagnostics.fts,
        seen,
        events
      };
    },
    {
      modulePath: BROWSER_MODULE,
      workspaceId,
      send: options.send === true,
      resume: options.resume === true,
      stopAfterStart: options.stopAfterStart === true,
      expectText: options.expectText ?? ANSWER,
      timeoutMs: options.timeoutMs ?? 15_000
    }
  );
}
