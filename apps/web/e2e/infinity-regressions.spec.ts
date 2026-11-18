import { expect, test } from "@playwright/test";

/**
 * Regressions for the five defects found while getting a browser turn to the
 * provider. Each test fails if its defect returns.
 */

import { ANSWER, MODEL, mockModel, probe } from "./support/browser-probe";

test("a turn is actually submitted before the provider is reached", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  let modelCalls = 0;
  await context.route(MODEL, async (route) => {
    modelCalls += 1;
    await mockModel(route);
  });
  await page.goto("/workspace");

  const result = await probe(page, `regress-submit-${testInfo.project.name}`, { send: true });

  // The defect: a spec asserted provider invocation without ever sending a turn.
  expect(result.submitted, "startTurn never resolved, so nothing was submitted").toBe(true);
  expect(modelCalls, "a submitted turn must reach the provider").toBeGreaterThan(0);
  expect(result.chat.join("")).toContain(ANSWER);
});

test("every emitted event carries a non-empty threadId", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  await context.route(MODEL, mockModel);
  await page.goto("/workspace");

  const result = await probe(page, `regress-thread-${testInfo.project.name}`, { send: true });

  const lifecycle = result.events.filter((event) =>
    ["turn_started", "message_delta", "turn_completed"].includes(event.type)
  );
  expect(lifecycle.length, "a completed turn emits its lifecycle events").toBeGreaterThan(0);
  for (const event of lifecycle) {
    // The defect: an empty thread id was silently dropped by the contract schema.
    expect(event.threadId, `${event.type} must name its thread; trace=${result.trace}`).toBeTruthy();
  }
});

test("one turn produces exactly one lifecycle sequence", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  await context.route(MODEL, mockModel);
  await page.goto("/workspace");

  const result = await probe(page, `regress-dupes-${testInfo.project.name}`, { send: true });
  const started = result.events.filter((event) => event.type === "turn_started");
  const completed = result.events.filter((event) => event.type === "turn_completed");

  // The defect: history was appended twice, so each event arrived twice.
  expect(started, "one turn_started per turn").toHaveLength(1);
  expect(completed, "one turn_completed per turn").toHaveLength(1);
  expect(completed[0]?.status).toBe("completed");
});

test("the Wasm engine in the worker really has FTS5", async ({ page }, testInfo) => {
  test.setTimeout(70_000);
  await page.goto("/workspace");

  const result = await probe(page, `regress-fts-${testInfo.project.name}`);

  // The store cannot be opened on a page thread (sync access handles are
  // worker-only), so the engine's own answer is the honest evidence here.
  expect(result.fts, "the worker's SQLite build must support FTS5 and hold the index").toBe(true);
});

test("a corrupt data key is reported and never replaced", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  await context.route(MODEL, mockModel);
  await page.goto("/workspace");
  const workspace = `regress-key-${testInfo.project.name}`;

  // First establish a readable record under a good key.
  const before = await probe(page, workspace, { send: true });
  expect(before.owned).toBe(true);
  expect(before.view).toContain("Hello from the browser");

  const result = await page.evaluate(async ({ modulePath, workspace }) => {
    const { InfinityBrowserClient }: {
      InfinityBrowserClient: typeof import("../lib/infinity-browser-client").InfinityBrowserClient;
    } = await import(modulePath);
    const keyName = `edapex.infinity.key.${workspace}`;
    const good = localStorage.getItem(keyName);
    // 62 hex characters: present but unreadable, which is corruption, not absence.
    localStorage.setItem(keyName, "00".repeat(31));

    const make = () =>
      new InfinityBrowserClient(
        { workspaceId: workspace, model: "test-model", mobileSafeTools: false },
        { onEvent: () => {}, onTool: async () => ({ success: true, text: "" }), onApproval: async () => true }
      );

    const corrupt = make();
    const failed = await corrupt.connect();
    const reportedKey = localStorage.getItem(keyName);
    await corrupt.dispose().catch(() => undefined);

    // Restoring the real key must make the earlier transcript readable again.
    if (good !== null) localStorage.setItem(keyName, good);
    const recovered = make();
    const outcome = await recovered.connect();
    await recovered.dispose().catch(() => undefined);

    return {
      code: failed.failure?.code ?? null,
      owned: failed.owned,
      rotated: reportedKey !== "00".repeat(31),
      recovered: outcome.owned
    };
  }, { modulePath: "/lib/infinity-browser-client.ts", workspace });

  // The defect: a corrupt key was silently replaced, orphaning every ciphertext.
  expect(result.owned).toBe(false);
  expect(result.code).toBe("storage_corrupted");
  expect(result.rotated, "the corrupt key must not be replaced").toBe(false);
  expect(result.recovered, "restoring the key must reopen the same session").toBe(true);
});
