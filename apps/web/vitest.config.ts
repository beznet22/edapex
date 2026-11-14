import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the web surface.
 *
 * Scoped to `tests/` on purpose. The default glob also matches `e2e/*.spec.ts`,
 * which are Playwright specs: Vitest would import them, fail on the `test` import
 * from `@playwright/test`, and report two broken suites.
 */
export default defineConfig({
  resolve: {
    // Mirrors the alias in `vite.config.ts` so tests can import application
    // modules by the same path the app uses.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".cloudflare/**"]
  }
});
