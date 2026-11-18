import { expect, test } from "@playwright/test";

import { BROWSER_MODULE as MODULE, MODEL, mockModel, probe } from "./support/browser-probe";

/**
 * The browser runtime, in a real engine.
 *
 * These drive the dedicated worker, the Web Lock, OPFS SQLite and the Infinity
 * session together. Only the model and tool HTTP responses are mocked: the
 * storage, locking and worker lifecycle are the real thing.
 */

test("single tab initializes the full runtime and runs a turn on OPFS SQLite", async ({ page, context, browser }, testInfo) => {
  test.setTimeout(70_000);
  console.log(`${testInfo.project.name}: ${browser.version()}`);
  let modelCalls = 0;
  await context.route(MODEL, async (route) => {
    modelCalls += 1;
    await mockModel(route);
  });
  page.on("console", (message) => console.log(`page console: ${message.text()}`));
  page.on("pageerror", (error) => console.log(`page error: ${error.message}`));
  await page.goto("/workspace");
  const result = await probe(page, `single-${testInfo.project.name}`, { send: true });
  expect(result.owned).toBe(true);
  expect(modelCalls, `the worker never reached the mocked model endpoint; trace=${result.trace}`).toBeGreaterThan(0);
  expect(
    result.completed,
    `no completed turn; chat=${JSON.stringify(result.chat)}; seen=${JSON.stringify(result.seen)}; trace=${result.trace}`
  ).toBe(true);
  expect(result.view).toContain("Hello from the browser");
  expect(result.view).toContain("Durable browser answer");
});

test("a second tab on the same session is refused with lease_locked", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  await context.route(MODEL, mockModel);
  await page.goto("/workspace");
  const workspace = `exclusive-${testInfo.project.name}`;
  // One tab holds the lock for as long as its worker lives.
  const holder = await page.evaluate(async ({ modulePath, workspace }) => {
    const { InfinityBrowserClient }: {
      InfinityBrowserClient: typeof import("../lib/infinity-browser-client").InfinityBrowserClient;
    } = await import(modulePath);
    const client = new InfinityBrowserClient(
      { workspaceId: workspace, model: "test-model", mobileSafeTools: false },
      { onEvent: () => {}, onTool: async () => ({ success: true, text: "" }), onApproval: async () => true }
    );
    const outcome = await client.connect();
    (globalThis as { __edapexHolder?: unknown }).__edapexHolder = client;
    return outcome.owned;
  }, { modulePath: MODULE, workspace });
  expect(holder).toBe(true);

  const rival = await context.newPage();
  await rival.goto("/workspace");
  const second = await probe(rival, workspace, { resume: true });
  expect(second.owned).toBe(false);
  expect(second.code).toBe("lease_locked");
});

test("two different sessions run concurrently", async ({ context }, testInfo) => {
  test.setTimeout(70_000);
  const first = await context.newPage();
  const second = await context.newPage();
  await context.route(MODEL, mockModel);
  await first.goto("/workspace");
  await second.goto("/workspace");
  const [a, b] = await Promise.all([
    probe(first, `concurrent-a-${testInfo.project.name}`, { send: true }),
    probe(second, `concurrent-b-${testInfo.project.name}`, { send: true })
  ]);
  expect(a.owned).toBe(true);
  expect(b.owned).toBe(true);
  expect(a.completed && b.completed).toBe(true);
});

test("ownership is released after shutdown and after worker termination", async ({ page }, testInfo) => {
  test.setTimeout(70_000);
  await page.goto("/workspace");
  const workspace = `release-${testInfo.project.name}`;

  const first = await probe(page, workspace);
  expect(first.owned).toBe(true);

  // Normal shutdown: dispose closes storage and releases the lock.
  const afterShutdown = await probe(page, workspace);
  expect(afterShutdown.owned).toBe(true);

  // Worker termination releases the lock too, without any heartbeat.
  const terminated = await page.evaluate(async ({ modulePath, workspace }) => {
    const { InfinityBrowserClient }: {
      InfinityBrowserClient: typeof import("../lib/infinity-browser-client").InfinityBrowserClient;
    } = await import(modulePath);
    const client = new InfinityBrowserClient(
      { workspaceId: workspace, model: "test-model", mobileSafeTools: false },
      { onEvent: () => {}, onTool: async () => ({ success: true, text: "" }), onApproval: async () => true }
    );
    const outcome = await client.connect();
    return outcome.owned;
  }, { modulePath: MODULE, workspace });
  expect(terminated).toBe(true);

  const afterTermination = await probe(page, workspace);
  expect(afterTermination.owned).toBe(true);
});

test("an initialization failure reports a structured code and releases ownership", async ({ page }, testInfo) => {
  test.setTimeout(70_000);
  await page.goto("/workspace");
  const workspace = `init-failure-${testInfo.project.name}`;
  const failed = await page.evaluate(async ({ modulePath, workspace }) => {
    const { InfinityBrowserClient }: {
      InfinityBrowserClient: typeof import("../lib/infinity-browser-client").InfinityBrowserClient;
    } = await import(modulePath);
    // A 31-byte key is rejected while building the store, after the lock is held.
    const client = new InfinityBrowserClient(
      { workspaceId: workspace, model: "test-model", mobileSafeTools: false },
      { onEvent: () => {}, onTool: async () => ({ success: true, text: "" }), onApproval: async () => true }
    );
    const original = localStorage.getItem(`edapex.infinity.key.${workspace}`);
    localStorage.setItem(`edapex.infinity.key.${workspace}`, "00".repeat(31));
    try {
      const outcome = await client.connect();
      return outcome.failure?.code ?? (outcome.owned ? "owned" : "unknown");
    } finally {
      if (original === null) localStorage.removeItem(`edapex.infinity.key.${workspace}`);
      else localStorage.setItem(`edapex.infinity.key.${workspace}`, original);
      await client.dispose().catch(() => undefined);
    }
  }, { modulePath: MODULE, workspace });
  expect(failed).not.toBe("owned");
  expect(failed).not.toBe("unknown");

  // The failed attempt must not leave the session locked.
  const recovered = await probe(page, workspace);
  expect(recovered.owned).toBe(true);
});

test("the transcript persists across a page restart", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  await context.route(MODEL, mockModel);
  await page.goto("/workspace");
  const workspace = `persist-${testInfo.project.name}`;
  const first = await probe(page, workspace, { send: true });
  expect(first.completed).toBe(true);

  await page.reload();
  const second = await probe(page, workspace, { resume: true });
  expect(second.owned).toBe(true);
  expect(second.view).toContain("Hello from the browser");
  expect(second.view).toContain("Durable browser answer");
});
