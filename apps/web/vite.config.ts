import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  server: {
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
});
