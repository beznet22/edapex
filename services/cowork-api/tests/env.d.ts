import type { D1Migration } from "@cloudflare/vitest-plugin";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Injected by the vitest plugin; applied in `tests/setup/apply-migrations.ts`. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
