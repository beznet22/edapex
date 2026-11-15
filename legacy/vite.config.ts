import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from "fs";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    allowedHosts: ["dev.beznet.org"],
    // Don't watch .workspaces/ — writes from the upload endpoint
    // would otherwise trigger a full HMR reload and lose in-flight
    // UI state (file pills, chat streaming, etc.).
    watch: {
      ignored: [
        '**/.workspaces/**',
        '**/.kimchi/**',
        '**/node_modules/**'
      ]
    }
  },
  build: {
    commonjsOptions: {
      ignoreDynamicRequires: true
    },
    rollupOptions: {
      external: [/@libsql\//, 'libsql', '@neon-rs/load', 'detect-libc']
    }
  }
});

/*
 * ─── Vite dev server quirks ───────────────────────────────────────────────
 *
 * If you see this in the dev console after editing files or reloading
 * the page:
 *
 *   [vite] (ssr) Error when evaluating SSR module /src/routes/...:
 *   transport was disconnected, cannot call "fetchModule"
 *
 *   Error: Vite module runner has been closed.
 *
 * This is a Vite 7 dev-server quirk, not a code bug. It happens when
 * the HMR module runner is torn down (e.g. because file changes
 * invalidated a deeply-nested module) while an SSR request is still
 * in flight. The page returns 500 until the next successful render.
 *
 * Workaround: do a clean dev-server restart. Stop `pnpm run dev` with
 * Ctrl-C and start it again. Production is unaffected — there is no
 * module runner in production builds.
 *
 * ──────────────────────────────────────────────────────────────────────────
 */
