import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Relative to the vitest working directory (apps/api), not the config file.
const MIGRATIONS_DIR = "src/lib/server/db/migrations";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(MIGRATIONS_DIR);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } }
      })
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup/apply-migrations.ts"]
    }
  };
});
