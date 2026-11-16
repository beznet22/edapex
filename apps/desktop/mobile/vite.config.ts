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
 * Port 5182 so a desktop and a mobile dev server can run at once. On a device, reach it
 * with `adb reverse tcp:5182 tcp:5182` — the WebView's `localhost` is the phone.
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
    host: "127.0.0.1",
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
