import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Relative to the vitest working directory (services/sms-api), not the config file.
const MIGRATIONS_DIR = "src/lib/server/db/migrations";

/**
 * Stand-in for `edapex-model-router`.
 *
 * The real Worker is a separate deployment with no public hostname, so tests
 * cannot resolve it. This stub answers the same shape and records what the
 * passthrough forwarded, which is what the tests actually need to assert: the
 * identity headers and that no provider credential is invented locally.
 */
const MODEL_ROUTER_STUB = `
export default {
  async fetch(request) {
    const body = await request.text();
    const headers = Object.fromEntries(request.headers);
    if (!body.includes("messages")) {
      return new Response(JSON.stringify({
        error: { message: "bad request", type: "invalid_request_error", code: "invalid_request" }
      }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // Echo the identity so a test can prove the passthrough stamps it.
    return new Response(
      "data: " + JSON.stringify({ forwardedUser: headers["x-edapex-user-id"] ?? null, body }) + "\\n\\n",
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
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
          bindings: {
            TEST_MIGRATIONS: migrations,
            MODEL_ROUTER_SECRET: "test-router-secret"
          },
          workers: [
            {
              name: "edapex-model-router",
              modules: true,
              script: MODEL_ROUTER_STUB
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
