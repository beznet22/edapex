import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite for the workspace surface.
 *
 * Scoped to `e2e/` on purpose: without `testDir` Playwright's default glob picks
 * up the Vitest files under `tests/` and dies with "No tests found".
 *
 * `NODE_ENV` is pinned to development. The shell exports `production`, which makes
 * react-dom resolve to its production server build while Vite still emits the dev
 * JSX runtime — the two disagree and every server render throws
 * `dispatcher.getOwner is not a function`.
 */
const PORT = Number(process.env.E2E_PORT ?? 5181);
const isProductionTarget = process.env.E2E_TARGET === "production";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI === "true" ? 1 : 0,
  workers: 1,
  reporter: process.env.CI === "true" ? "line" : [["list"]],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],

  webServer: {
    // `--host 127.0.0.1` is explicit: Vite otherwise binds `localhost`, which
    // resolves to `::1` first on some runners, and the poll below targets IPv4 —
    // the server is up but unreachable, so Playwright reports a 180s timeout with
    // no useful cause.
    command: isProductionTarget
      ? `pnpm build && pnpm exec vinext start --port ${PORT}`
      : `pnpm exec vite dev --host 127.0.0.1 --port ${PORT}`,
    // Without this a failed start is silent; the only symptom is a timeout.
    stdout: "pipe",
    stderr: "pipe",
    url: `http://127.0.0.1:${PORT}/workspace`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: isProductionTarget ? "production" : "development",
      // The bypass exposes a fixed admin session with no school data. It is
      // development-only by construction, so nothing here weakens production.
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "1"
    }
  }
});
