import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";

export default defineConfig(({ command }) => {
  const plugins: PluginOption[] = [vinext(), tailwindcss()];
  if (command === "build") {
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }
      })
    );
  }

  return {
    worker: { format: "es" },
    plugins,
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./", import.meta.url))
      }
    },
    server: {
      port: 5181,
      strictPort: true,
      proxy: {
        /*
         * `cowork-api` owns the agent workspace routes; `sms-api` owns sessions and the
         * school database. Two Workers, one `/api` prefix, so the proxy has to split them.
         *
         * These keys are *before* `/api` because Vite matches contexts in declaration order.
         * Only the paths cowork actually mounts are listed — a blanket `/api/v1/agent` would
         * steal `/agent/capabilities`, `/agent/web` and `/agent/model`, which sms-api serves.
         *
         *   pnpm --dir services/cowork-api dev     # :8788
         *   DEV_COWORK_TARGET=http://127.0.0.1:8788 pnpm dev
         */
        ...(process.env.DEV_COWORK_TARGET === undefined
          ? {}
          : Object.fromEntries(
              [
                "/api/v1/agent/routines",
                "/api/v1/agent/tasks",
                "/api/v1/agent/agents",
                "/api/v1/agent/sync",
                "/api/v1/agent/connectors"
              ].map((path) => [
                path,
                {
                  target: process.env.DEV_COWORK_TARGET,
                  changeOrigin: true,
                  secure: false
                }
              ])
            )),
        "/api": {
          /*
           * `DEV_API_TARGET` points the proxy at a local `wrangler dev` worker.
           *
           * Without it the dev server proxies to production, which means a local sign-in
           * sets a `__Host-` cookie on the *API* host and then redirects to
           * `app.llacademy.ng` — the browser leaves your machine and the workspace you land
           * on has no session for it. Pointing at localhost keeps the whole round trip on
           * one origin, which is what makes `LOCAL_EMAIL_LOG` usable end to end.
           *
           *   DEV_API_TARGET=http://127.0.0.1:8787 pnpm dev
           */
          target: process.env.DEV_API_TARGET ?? "https://api.llacademy.ng",
          changeOrigin: true,
          secure: !process.env.DEV_API_TARGET?.startsWith("http://"),
          configure: (proxy) => {
            const cookie = process.env.DEV_API_COOKIE;
            if (cookie === undefined || cookie.length === 0) return;
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("cookie", cookie);
            });
          }
        }
      }
    }
  };
});
