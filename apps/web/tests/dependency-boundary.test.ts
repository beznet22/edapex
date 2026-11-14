import { describe, expect, it } from "vitest";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pkg from "../package.json";

const BANNED = [
  "ai",
  "@ai-sdk/react",
  "@copilotkit/react-core",
  "@assistant-ui/react",
  "@a2ui/core",
  "next-auth",
  "drizzle-orm",
  "postgres",
  "redis",
  "@vercel/blob",
  "botid",
  "novel"
] as const;

/** Packages that must never reach a client bundle. */
const SERVER_ONLY = [
  "@edapex/connectors",
  "edapex-cowork-api",
  "edapex-model-router"
] as const;

describe("web dependency boundary", () => {
  it("does not carry the starter or reference runtime", () => {
    const names = new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies)
    ]);
    const found = BANNED.filter((name) => names.has(name));
    expect(found).toEqual([]);
  });

  it("carries no connector code", () => {
    // Spec 60: connector code, credentials and catalogue never enter the web
    // bundle, the Tauri binary or the APK. A dependency check is the only place
    // this can fail loudly: the bundle would otherwise include it silently.
    const names = new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies)
    ]);
    const found = SERVER_ONLY.filter((name) => names.has(name));
    expect(found).toEqual([]);
  });

  it("carries no server-side connector import anywhere in the source", () => {
    // A dynamic import or a deep path would evade the manifest check above.
    const offenders: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", ".next", ".vinext", ".cloudflare", "dist"].includes(entry.name)) {
            continue;
          }
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const contents = readFileSync(full, "utf8");
        if (/from\s+["']@edapex\/connectors/.test(contents)) offenders.push(full);
      }
    };
    walk(join(import.meta.dirname, ".."));
    expect(offenders).toEqual([]);
  });

  it("pins the tested vinext and React versions", () => {
    expect(pkg.dependencies.vinext).toBe("1.4.5");
    expect(pkg.dependencies.react).toBe("19.3.1");
    expect(pkg.dependencies["react-dom"]).toBe("19.3.1");
  });
});
