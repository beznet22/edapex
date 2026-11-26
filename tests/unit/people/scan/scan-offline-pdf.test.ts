import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * The queue itself needs IndexedDB, which the node test environment does not provide. What can be
 * asserted without a browser is the contract that makes replay safe: a stable id generated before
 * enqueue, and removal only after a definitive outcome.
 */
describe("offline queue contract (plan Gate 3)", () => {
  it("generates the captureId before enqueueing so replay is idempotent", async () => {
    const source = await readFile("src/lib/people/scan/scan-queue.ts", "utf8");
    const enqueueAt = source.indexOf("export async function enqueueCapture");
    const idAt = source.indexOf("createQueuedCaptureId");

    expect(idAt).toBeGreaterThan(-1);
    expect(enqueueAt).toBeGreaterThan(idAt);
  });

  it("stores the blob plus the target student and exam", async () => {
    const source = await readFile("src/lib/people/scan/scan-queue.ts", "utf8");
    const start = source.indexOf("export interface QueuedCapture");
    const body = source.slice(start, source.indexOf("}\n", start));

    for (const field of ["captureId", "studentId", "examTypeId", "blob", "createdAt"]) {
      expect(body).toContain(field);
    }
  });

  it("keeps an item on a 5xx but drops it when the server refuses", async () => {
    const source = await readFile("src/lib/people/scan/scan-queue.ts", "utf8");
    const replayAt = source.indexOf("export async function replayQueuedCaptures");
    const body = source.slice(replayAt);

    // 5xx keeps the item...
    expect(body).toMatch(/status >= 500[\s\S]{0,260}continue;/);
    // ...and a refusal removes it, so a permanently invalid capture cannot loop forever.
    expect(body).toMatch(/status >= 500[\s\S]*removeQueuedCapture/);
  });

  it("replays through the same capture then extract pair as the online path", async () => {
    const source = await readFile("src/lib/people/scan/scan-queue.ts", "utf8");
    expect(source).toContain("/api/people/marks/capture");
    expect(source).toContain("/api/people/marks/extract");
  });

  it("does not rely on Background Sync, which Safari never shipped", async () => {
    const source = await readFile("src/lib/people/scan/scan-queue.ts", "utf8");
    expect(source).not.toContain("serviceWorker.ready");

    const banner = await readFile(
      "src/lib/components/people/scan/scan-offline-banner.svelte",
      "utf8"
    );
    expect(banner).toContain('addEventListener("online"');
  });
});

describe("scanner queues instead of failing when offline", () => {
  it("checks navigator.onLine before posting the capture", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    const offlineAt = source.indexOf("!navigator.onLine");
    const postAt = source.indexOf('fetch("/api/people/marks/capture"');

    expect(offlineAt).toBeGreaterThan(-1);
    expect(postAt).toBeGreaterThan(offlineAt);
    expect(source).toContain("enqueueCapture");
  });
});

describe("result PDF is authenticated and side-effect free", () => {
  it("authorises through assertScanScope before rendering", async () => {
    const source = await readFile(
      "src/routes/api/people/marks/pdf/[studentId]/+server.ts",
      "utf8"
    );
    expect(source).toContain("assertScanScope");
    expect(source.indexOf("assertScanScope")).toBeLessThan(source.indexOf("getStudentResult"));
  });

  it("never mutates status — a preview is a view, not a transition", async () => {
    const source = await readFile(
      "src/routes/api/people/marks/pdf/[studentId]/+server.ts",
      "utf8"
    );
    expect(source).not.toContain("writeScanEnvelope");
    expect(source).not.toContain("upsertMarksheet");
    expect(source).toContain("no-store");
  });
});
