import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "76846cbc170d893773979fd89e266e42",
  worker: defineWorker({
    name: "edapex-web",
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-03",
    compatibilityFlags: ["nodejs_compat"],
    previewUrls: true,
    workersDev: true,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"]
    },
    env: {
      ASSETS: bindings.assets()
    },
    observability: {
      enabled: true
    }
  })
});
