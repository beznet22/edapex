import { expect, test } from "@playwright/test";

/**
 * Failures and interruption.
 *
 * A turn that dies must say so with a typed code and settle, and a stop must
 * settle the turn as stopped rather than leaving it running forever.
 */

import { MODEL, mockModel, probe } from "./support/browser-probe";

test("a provider failure surfaces a typed error and settles the turn", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  let modelCalls = 0;
  await context.route(MODEL, async (route) => {
    modelCalls += 1;
    await route.fulfill({
      status: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "upstream refused" } })
    });
  });
  await page.goto("/workspace");

  const result = await probe(page, `failure-provider-${testInfo.project.name}`, {
    send: true,
    timeoutMs: 12_000
  });

  expect(result.submitted).toBe(true);
  expect(modelCalls, "the failing request must actually be attempted").toBeGreaterThan(0);

  const failure = result.events.find((event) => event.type === "error");
  expect(failure, `an error event must be emitted; seen=${JSON.stringify(result.seen)}`).toBeDefined();
  expect(failure?.code, "the error names its code").toBeTruthy();

  const settled = result.events.find((event) => event.type === "turn_completed");
  expect(settled, `the turn must settle; seen=${JSON.stringify(result.seen)}`).toBeDefined();
  expect(settled?.status).toBe("error");
  expect(result.chat.join("")).toBe("");
});

test("stop during a turn settles it as stopped", async ({ page, context }, testInfo) => {
  test.setTimeout(70_000);
  // The request never completes, so the turn is genuinely in flight when stop runs.
  await context.route(MODEL, async () => {
    await new Promise(() => undefined);
  });
  await page.goto("/workspace");

  const result = await probe(page, `failure-stop-${testInfo.project.name}`, {
    send: true,
    stopAfterStart: true,
    timeoutMs: 12_000
  });

  expect(result.submitted).toBe(true);

  const interrupted = result.events.find((event) => event.type === "interrupted");
  expect(interrupted, `a stop must emit interrupted; seen=${JSON.stringify(result.seen)}`).toBeDefined();

  const stopped = result.events.find((event) => event.type === "turn_completed");
  expect(stopped, `the turn must settle; seen=${JSON.stringify(result.seen)}`).toBeDefined();
  expect(stopped?.status).toBe("stopped");

  await context.unroute(MODEL);
});
