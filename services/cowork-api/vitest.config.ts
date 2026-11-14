import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Relative to the vitest working directory (services/cowork-api).
const MIGRATIONS_DIR = "migrations/agent";

/**
 * Stand-in for `services/sms-api`.
 *
 * The real Worker owns the session table and the school database, neither of
 * which exists in this test environment. This stub answers the one endpoint the
 * auth middleware uses, so tests can control which user is signed in without
 * pretending to have a session database here.
 */
const SMS_API_STUB = `
export default {
  async fetch(request) {
    const cookie = request.headers.get("cookie") ?? "";
    // A cookie that does not match deliberately returns 401.
    const match = /edapex_session=user-(\\d+)/.exec(cookie);
    if (!match) {
      return new Response(JSON.stringify({ error: { message: "unauthorized" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ user: { id: Number(match[1]) } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }
};
`;

export default defineConfig(async () => {
  const migrations = await readD1Migrations(MIGRATIONS_DIR);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
          workers: [
            {
              name: "edapex-api",
              modules: true,
              script: SMS_API_STUB
            }
          ]
        }
      })
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup/apply-migrations.ts"]
    }
  };
});
