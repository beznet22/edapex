import { defineConfig } from "vitest/config";

/**
 * Unit tests for the web surface.
 *
 * Scoped to `tests/` on purpose. The default glob also matches `e2e/*.spec.ts`,
 * which are Playwright specs: Vitest would import them, fail on the `test` import
 * from `@playwright/test`, and report two broken suites.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".cloudflare/**"]
  }
});
