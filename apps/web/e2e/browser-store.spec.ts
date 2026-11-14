import { expect, test } from "@playwright/test";

/**
 * The store, running in a browser.
 *
 * This is the only test that proves the browser path end to end: OPFS SQLite in
 * WASM, the Rust `SqlDriver` bridge, per-record encryption, the outbox, and the
 * wire payload the sync service accepts. Everything else about the store is
 * tested natively, which says nothing about whether it works across the
 * wasm-bindgen boundary.
 */

const HARNESS = "/workspace/offline";

/**
 * Resolves an application module inside the page.
 *
 * The specifier is built at runtime because these modules live in the served app,
 * not in the test bundle: a literal path would be resolved by TypeScript against
 * this directory and fail to resolve.
 */
const MODULE = "/lib/browser-store.ts";

test.describe("browser store", () => {
  test("writes, encrypts, reads back and produces a push batch", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(HARNESS);

    const result = await page.evaluate(async (modulePath) => {
      const { openBrowserStore } = (await import(/* @vite-ignore */ modulePath)) as typeof import("../lib/browser-store");

      const store = await openBrowserStore({
        masterKey: new Uint8Array(32).fill(7),
        filename: "/e2e-store.db"
      });

      // `messages.thread_id` is a foreign key, so the thread has to exist.
      store.writeRecord({
        entityType: "threads",
        entityId: "t-1",
        workspaceId: "ws-1",
        operation: "create",
        extra: [["updated_at", 100]],
        plaintext: JSON.stringify({ title: "Marks" }),
        deviceId: "device-a",
        createdAt: 100
      });

      const written = store.writeRecord({
        entityType: "messages",
        entityId: "m-1",
        workspaceId: "ws-1",
        operation: "create",
        extra: [
          ["thread_id", "t-1"],
          ["role", "user"],
          ["device_seq", 1]
        ],
        plaintext: "marks for AY4 are in",
        searchText: "marks for AY4 are in",
        deviceId: "device-a",
        createdAt: 101
      });

      const readBack = new TextDecoder().decode(store.readRecord("messages", "m-1"));
      const batch = store.pushBatch("device-a", 10);
      const found = store.search("AY4", 10);
      const cursorBefore = store.cursor("device-a", "ws-1");

      store.acknowledge("device-a", "ws-1", batch[batch.length - 1]!.deviceSeq);
      const afterAck = store.pushBatch("device-a", 10);
      const cursorAfter = store.cursor("device-a", "ws-1");

      return {
        persistent: store.persistent,
        version: store.version,
        written,
        readBack,
        batch,
        found,
        cursorBefore,
        cursorAfter,
        afterAckLength: afterAck.length
      };
    }, MODULE);

    expect(errors).toEqual([]);

    // OPFS may be unavailable in an unusual environment; the store must still
    // work, but say so rather than pretending it persists.
    expect(typeof result.persistent).toBe("boolean");
    expect(result.version).toBe(1);

    // Encryption round-trips through the Rust bridge.
    expect(result.readBack).toBe("marks for AY4 are in");

    // The wire payload is the shape the service validates.
    expect(result.batch).toHaveLength(2);
    for (const item of result.batch as { checksum: string; ciphertext: string; deviceSeq: number }[]) {
      expect(item.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(item.ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(item.deviceSeq).toBeGreaterThan(0);
    }

    // The plaintext must not be recoverable from the pushed ciphertext.
    const decoded = result.batch.map((item: { ciphertext: string }) => atob(item.ciphertext)).join("");
    expect(decoded).not.toContain("marks for AY4");

    // Derived search index works in the browser.
    expect(result.found).toContain("m-1");

    expect(result.cursorBefore).toBe(0);
    expect(result.cursorAfter).toBe(result.batch[result.batch.length - 1]!.deviceSeq);
    expect(result.afterAckLength).toBe(0);
  });

  test("a failed transaction leaves no outbox row", async ({ page }) => {
    await page.goto(HARNESS);

    const result = await page.evaluate(async (modulePath) => {
      const { openBrowserStore } = (await import(/* @vite-ignore */ modulePath)) as typeof import("../lib/browser-store");
      const store = await openBrowserStore({
        masterKey: new Uint8Array(32).fill(9),
        filename: "/e2e-store-atomic.db"
      });

      const before = store.pushBatch("device-a", 100).length;
      let threw = false;
      try {
        // `thread_id` is NOT NULL, so this write fails inside the transaction.
        store.writeRecord({
          entityType: "messages",
          entityId: "m-orphan",
          workspaceId: "ws-1",
          operation: "create",
          extra: [["role", "user"]],
          plaintext: "orphan",
          deviceId: "device-a",
          createdAt: 1
        });
      } catch {
        threw = true;
      }
      return { threw, before, after: store.pushBatch("device-a", 100).length };
    }, MODULE);

    expect(result.threw).toBe(true);
    expect(result.after).toBe(result.before);
  });

  test("rejects a master key of the wrong length", async ({ page }) => {
    await page.goto(HARNESS);

    const message = await page.evaluate(async (modulePath) => {
      const { openBrowserStore } = (await import(/* @vite-ignore */ modulePath)) as typeof import("../lib/browser-store");
      try {
        await openBrowserStore({ masterKey: new Uint8Array(16) });
        return "no error";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, MODULE);

    expect(message).toContain("32 bytes");
  });
});
