import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The Android frontend.
 *
 * `base: "./"` because the Tauri asset protocol serves the bundle from a virtual origin
 * (`https://tauri.localhost`) and absolute `/assets/...` URLs would escape it.
 *
 * Port 5182 so a desktop and a mobile dev server can run at once.
 *
 * `host: "0.0.0.0"` because `tauri android dev` on a physical device rewrites `devUrl` to
 * the machine's LAN address and waits for the bundle there; a loopback-only server leaves
 * it waiting forever with `adb reverse` in place. The listener is a dev-server concern
 * only — `tauri android build` embeds the bundle and never opens a port.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5182,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false
  }
});
