import { expect, test, type Page } from "@playwright/test";

/**
 * The browser route, end to end.
 *
 * `POST /api/v1/agent/model/chat/completions` is intercepted and answered with a
 * recorded SSE stream, so this exercises the client half of the chain — request
 * shape, incremental decode, event reduction, transcript rendering — without a
 * provider credential. The real provider hop is covered by the Rust parity tests
 * and by `services/model-router`, which is the only component that holds a key.
 */

/** Assembles an OpenAI-shaped stream from text deltas. */
function sseFrom(deltas: readonly string[]): string {
  const chunk = (content: string): string =>
    `data: ${JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      created: 0,
      model: "openrouter/auto",
      choices: [{ index: 0, delta: { content }, finish_reason: null }]
    })}\n\n`;

  return (
    deltas.map(chunk).join("") +
    `data: ${JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      created: 0,
      model: "openrouter/auto",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    })}\n\n` +
    "data: [DONE]\n\n"
  );
}

/** Opens the model dialog and boots the WASM runtime. */
async function connectRuntime(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Choose a model" });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: "Open workspace" }).click();

  // The composer only enables once the runtime reports a live connection.
  await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled({
    timeout: 30_000
  });
}

test.describe("streaming", () => {
  test("a turn reaches the gateway route and streams into the transcript", async ({ page }) => {
    const requests: { url: string; body: string }[] = [];

    await page.route("**/api/v1/agent/model/chat/completions", async (route) => {
      const request = route.request();
      requests.push({ url: request.url(), body: request.postData() ?? "" });
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        },
        body: sseFrom(["Marks", " for", " AY4", " are", " in."])
      });
    });

    await page.goto("/workspace");
    await connectRuntime(page);

    await page.getByRole("textbox", { name: "Message" }).fill("Summarise AY4 marks");
    await page.getByRole("button", { name: /send/i }).click();

    await expect(page.getByText("Marks for AY4 are in.")).toBeVisible({ timeout: 20_000 });

    expect(requests.length).toBeGreaterThan(0);
    const [first] = requests;

    // OpenAI wire shape, not a bespoke camelCase envelope. The body is forwarded
    // verbatim to the provider, so a camelCase key here is silently dropped
    // upstream instead of failing loudly.
    const payload = JSON.parse(first.body) as Record<string, unknown>;
    expect(payload.stream).toBe(true);
    expect(Array.isArray(payload.messages)).toBe(true);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("toolCalls");
    expect(serialized).not.toContain("toolCallId");
    expect(serialized).not.toContain("tool_call_id\":null");

    // The path carries EdApex's version prefix exactly once; the OpenAI-style
    // `/v1` belongs to model-router alone.
    expect(new URL(first.url).pathname).toBe("/api/v1/agent/model/chat/completions");
  });

  test("no credential is ever sent from the browser", async ({ page }) => {
    const bodies: string[] = [];

    await page.route("**/api/v1/agent/model/chat/completions", async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: sseFrom(["ok"])
      });
    });

    await page.goto("/workspace");
    await connectRuntime(page);
    await page.getByRole("textbox", { name: "Message" }).fill("hello");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("ok")).toBeVisible({ timeout: 20_000 });

    // A key in the body would mean the credential reached the browser.
    for (const body of bodies) {
      expect(body).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(body).not.toContain("api_key");
      expect(body).not.toContain("apiKey");
    }

    // Nothing credential-shaped in web storage either.
    const stored = await page.evaluate(() => {
      const values: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key !== null) values.push(`${key}=${localStorage.getItem(key) ?? ""}`);
      }
      return values.join("\n");
    });
    expect(stored).not.toMatch(/sk-[A-Za-z0-9]/);
  });

  test("a failed turn surfaces an error instead of hanging", async ({ page }) => {
    await page.route("**/api/v1/agent/model/chat/completions", (route) =>
      route.fulfill({ status: 429, body: "rate limited", contentType: "text/plain" })
    );

    await page.goto("/workspace");
    await connectRuntime(page);
    await page.getByRole("textbox", { name: "Message" }).fill("hello");
    await page.getByRole("button", { name: /send/i }).click();

    // Whatever the wording, the composer must return to a usable state rather
    // than leaving the turn spinning forever.
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled({
      timeout: 20_000
    });
  });
});
