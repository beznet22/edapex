import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// A test asset, served from the test tree so it never ships. It cannot be a blob
// worker: the app CSP forbids that, which is also why this is not inlined.
const WORKER = readFileSync(new URL("./fixtures/opfs-probe-worker.js", import.meta.url), "utf8");

/**
 * Classification probe, not a product test: it answers whether
 * `createSyncAccessHandle` works at all inside a dedicated worker in this
 * engine, independently of our worker, our SQLite build and our init order.
 * A failure here is a browser or environment limitation; a pass means our
 * initialization sequence is at fault.
 */
test("opfs sync access handle is available in a dedicated worker", async ({ page, browserName }) => {
  // Playwright's WebKit build throws UnknownError on `createSyncAccessHandle`.
  // The same probe fails with no EdApex code on the page, so this is the engine,
  // not our initialization order; Safari stays unverified until it is measured
  // on a real device.
  test.skip(browserName === "webkit", "WebKit here cannot create an OPFS sync access handle");
  test.setTimeout(60_000);
  await page.route("**/opfs-probe-worker.js", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: WORKER })
  );
  await page.goto("/workspace");
  const result = await page.evaluate(async () => {
    // A blob worker is blocked by the app CSP, so the probe is served from public/.
    const worker = new Worker("/opfs-probe-worker.js");
    const outcome = await new Promise<unknown>((resolve) => {
      worker.onmessage = (event) => resolve(event.data);
      worker.onerror = (event) => resolve({ ok: false, name: "worker_error", error: event.message });
      worker.postMessage("run");
      setTimeout(() => resolve({ ok: false, name: "timeout", error: "no reply" }), 15_000);
    });
    worker.terminate();
    return outcome;
  });
  expect(result, `opfs probe returned ${JSON.stringify(result)}`).toMatchObject({ ok: true, text: "hi" });
});
