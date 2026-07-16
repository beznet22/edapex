import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from "fs";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    // Don't watch .workspaces/ — writes from the upload endpoint
    // would otherwise trigger a full HMR reload and lose in-flight
    // UI state (file pills, chat streaming, etc.).
    watch: {
      ignored: [
        '**/.workspaces/**',
        '**/.kimchi/**',
        '**/node_modules/**'
      ]
    }
  },
  ssr: {
    external: ['@libsql/linux-x64-gnu', '@libsql/linux-x64-musl']
  }
});
