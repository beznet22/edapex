import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetLogBufferForTests, getLogBuffer } from "$lib/server/telegram/log-buffer";

const { postMessageMock } = vi.hoisted(() => ({
  postMessageMock: vi.fn().mockResolvedValue({ messageId: "1" }),
}));

vi.mock("$lib/server/telegram/bot", () => ({
  telegramAdapter: { postMessage: postMessageMock },
  TELEGRAM_BOT_USERNAME: "",
  TELEGRAM_ADMIN_CHAT_ID: "",
}));

import {
  getAdminLogger,
  resetAdminLoggerForTests,
  type AdminLoggerConfig,
} from "$lib/server/telegram/admin-logger";

const ENABLED_CONFIG: AdminLoggerConfig = {
  chatId: "12345",
  burst: 5,
  // 1 hour refill so the token bucket is effectively static during tests.
  refillMs: 60 * 60_000,
  dedupMs: 5 * 60_000,
};

describe("telegram admin logger", () => {
  beforeEach(() => {
    postMessageMock.mockReset();
    postMessageMock.mockResolvedValue({ messageId: "1" });
    resetLogBufferForTests();
    resetAdminLoggerForTests(ENABLED_CONFIG);
  });

  it("forwards a single message to the adapter", async () => {
    const log = getAdminLogger();
    await log.warn("test", "hello world");
    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const text = postMessageMock.mock.calls[0]?.[1] as string;
    expect(text).toContain("hello world");
    expect(text).toContain("test");
  });

  it("respects the token bucket — drops beyond the burst limit", async () => {
    const log = getAdminLogger();
    // Use distinct sources to bypass dedup so we hit the bucket ceiling
    // on the number of forwarded events.
    for (let i = 0; i < 10; i++) {
      await log.warn(`source-${i}`, "msg");
    }
    // Bucket = 5. After 5 forwardings, the remaining 5 calls are dropped.
    // (5 forwarded + 0 dedup, because each source has a unique signature.)
    expect(postMessageMock).toHaveBeenCalledTimes(5);
  });

  it("dedupes identical signatures within the dedup window", async () => {
    const log = getAdminLogger();
    await log.warn("test", "same message");
    await log.warn("test", "same message");
    await log.warn("test", "same message");
    expect(postMessageMock).toHaveBeenCalledTimes(1);
  });

  it("treats different signatures as independent", async () => {
    const log = getAdminLogger();
    await log.warn("test", "msg A");
    await log.warn("test", "msg B");
    expect(postMessageMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes numeric IDs in the dedup signature", async () => {
    const log = getAdminLogger();
    await log.warn("test", "error with studentId=123");
    await log.warn("test", "error with studentId=456");
    await log.warn("test", "error with studentId=789");
    // All three normalize to the same signature; only the first goes out.
    expect(postMessageMock).toHaveBeenCalledTimes(1);
  });

  it("emits a summary at the dedup window expiry", async () => {
    const log = resetAdminLoggerForTests({
      ...ENABLED_CONFIG,
      burst: 100,
      dedupMs: 50,
    });
    await log.warn("test", "duplicate event");
    await log.warn("test", "duplicate event");
    await log.warn("test", "duplicate event");
    expect(postMessageMock).toHaveBeenCalledTimes(1);
    // Wait past the dedup window.
    await new Promise((r) => setTimeout(r, 80));
    await log.warn("test", "duplicate event");
    // After window expiry, the new event: emits the summary, then
    // forwards itself as the start of a new bucket. Total: 1 + 2 = 3.
    expect(postMessageMock).toHaveBeenCalledTimes(3);
    const summaryText = postMessageMock.mock.calls[1]?.[1] as string;
    expect(summaryText).toContain("suppressed");
  });

  it("is a no-op when TELEGRAM_ADMIN_CHAT_ID is unset", async () => {
    const log = resetAdminLoggerForTests(null);
    await log.warn("test", "should not forward");
    await log.error("test", new Error("also should not"));
    expect(postMessageMock).not.toHaveBeenCalled();
  });

  it("still writes to the in-memory log buffer when disabled", async () => {
    const log = resetAdminLoggerForTests(null);
    await log.warn("test", "buffered anyway");
    expect(getLogBuffer().size()).toBe(1);
  });

  it("error() never throws even with a throwing Error object", async () => {
    const log = getAdminLogger();
    const circular: Record<string, unknown> = { name: "x" };
    circular["self"] = circular;
    const bad = new Error("boom") as Error & { extra: typeof circular };
    bad.extra = circular;
    await expect(log.error("test", bad)).resolves.toBeUndefined();
  });

  it("error() never throws with null/undefined err", async () => {
    const log = getAdminLogger();
    await expect(log.error("test", null)).resolves.toBeUndefined();
    await expect(log.error("test", undefined)).resolves.toBeUndefined();
  });

  it("deferred-queues when the adapter throws, then drains on next success", async () => {
    postMessageMock.mockRejectedValueOnce(new Error("network blip"));
    postMessageMock.mockResolvedValueOnce({ messageId: "1" });
    const log = getAdminLogger();
    await log.warn("test", "deferred entry");
    expect(postMessageMock).toHaveBeenCalledTimes(1);
    await log.flush();
    // After flush, the deferred entry is re-sent.
    expect(postMessageMock).toHaveBeenCalledTimes(2);
  });
});
