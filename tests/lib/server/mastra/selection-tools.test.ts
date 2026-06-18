import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    LIBSQL_URL: "file:tests/.tmp/test.db",
    LIBSQL_AUTH_TOKEN: "test",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
    TINYFISH_API_KEY: "test-key",
  },
}));

vi.mock("$env/dynamic/public", () => ({
  env: {
    PUBLIC_STORAGE_PATH: "/tmp/test-storage",
  },
}));

vi.mock("$app/server", () => ({
  getRequestEvent: () => null,
}));

vi.mock("$app/environment", () => ({
  dev: true,
  browser: false,
}));

vi.mock("$lib/components/template/ResultTemplate.svelte", () => ({
  default: {},
}));

vi.mock("$lib/components/template/result-email.svelte", () => ({
  default: {},
}));

import { requestSelectionLogic } from "$lib/server/mastra/tools/selection-tools";

describe("requestSelectionLogic", () => {
  function makeContext() {
    const store = new Map<string, unknown>();
    return {
      context: {
        set: (key: string, value: unknown) => {
          store.set(key, value);
        },
        get: (key: string) => store.get(key),
      },
      store,
    };
  }

  it("stores pending selection in context and returns NEEDS_SELECTION", async () => {
    const { context, store } = makeContext();

    const result = await requestSelectionLogic(context, {
      options: [
        { id: "opt-1", label: "Option 1", icon: "check" },
        { id: "opt-2", label: "Option 2" },
      ],
      prompt: "Choose one",
      contextKey: "selectedOption",
    });

    expect(result).toEqual({ status: "NEEDS_SELECTION" });
    expect(store.has("pendingSelection")).toBe(true);
    expect(store.get("pendingSelection")).toEqual({
      options: [
        { id: "opt-1", label: "Option 1", icon: "check" },
        { id: "opt-2", label: "Option 2" },
      ],
      prompt: "Choose one",
      contextKey: "selectedOption",
    });
  });
});
