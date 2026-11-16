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
