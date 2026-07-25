import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("telegram reply keyboard", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("module loads and exports sendReplyKeyboard", async () => {
    const mod = await import("$lib/server/telegram/reply-keyboard");
    expect(mod.sendReplyKeyboard).toBeInstanceOf(Function);
  });

  it("sendReplyKeyboard does not throw when fetch fails", async () => {
    const mod = await import("$lib/server/telegram/reply-keyboard");
    await expect(mod.sendReplyKeyboard("12345")).resolves.toBeUndefined();
  });

  it("sendReplyKeyboard calls the Telegram API with correct chatId", async () => {
    const mod = await import("$lib/server/telegram/reply-keyboard");
    await mod.sendReplyKeyboard("99999");
    expect(globalThis.fetch).toHaveBeenCalled();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/bot");
    expect(call[0]).toContain("/sendMessage");
    const body = JSON.parse(call[1].body);
    expect(body.chat_id).toBe("99999");
    expect(body.reply_markup.keyboard).toBeDefined();
    expect(body.reply_markup.persistent).toBe(true);
    expect(body.reply_markup.resize_keyboard).toBe(true);
  });
});
