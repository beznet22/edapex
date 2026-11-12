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
          target: "https://api.llacademy.ng",
          changeOrigin: true,
          secure: true,
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
