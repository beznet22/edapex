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
      // The Infinity suite runs in its own explicit Chromium/Firefox/WebKit
      // projects; without this it also executes here and every test is doubled.
      testIgnore: "infinity-*.spec.ts",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      // The store worker is engine-sensitive: OPFS sync access handles exist in
      // workers on both engines, and this proves the worker boundary on Firefox,
      // not just Chromium.
      name: "store-firefox",
      testMatch: "browser-store.spec.ts",
      use: { ...devices["Desktop Firefox"], browserName: "firefox" }
    },
    {
      name: "infinity-chromium",
      testMatch: "infinity-*.spec.ts",
      use: { ...devices["Desktop Chrome"], browserName: "chromium" }
    },
    {
      name: "infinity-firefox",
      testMatch: "infinity-*.spec.ts",
      use: { ...devices["Desktop Firefox"], browserName: "firefox" }
    },
    {
      name: "infinity-webkit",
      testMatch: "infinity-*.spec.ts",
      use: { ...devices["Desktop Safari"], browserName: "webkit" }
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
      /*
       * A fixture for the runner, not a dev bypass. It also requires a loopback API base
       * (see `lib/test-session.ts`), so a production bundle carrying the flag still
       * refuses to activate against a real origin.
       */
      NEXT_PUBLIC_TEST_SESSION: "1"
    }
  }
});
