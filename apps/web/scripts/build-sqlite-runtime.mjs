#!/usr/bin/env node
/**
 * Publish the official SQLite WASM engine into `public/sqlite/`.
 *
 * The engine is the published `@sqlite.org/sqlite-wasm` package — no local
 * compilation pipeline. It is copied rather than bundled because the loader
 * resolves its own `.wasm` by URL at runtime, and a bundler rewriting that path is
 * how this works in dev and breaks in production.
 *
 * The copy is generated, not committed, and the size gate fails the build rather
 * than letting the engine grow unnoticed.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = join(root, "..", "..", "node_modules", ".pnpm");
const outDir = join(root, "public", "sqlite");

/** Locates the hoisted pnpm package without hard-coding a version hash. */
function findPackage() {
  const entry = readdirSync(store).find((name) => name.startsWith("@sqlite.org+sqlite-wasm@"));
  if (entry === undefined) {
    throw new Error("Install @sqlite.org/sqlite-wasm before publishing the SQLite runtime.");
  }
  return join(store, entry, "node_modules", "@sqlite.org", "sqlite-wasm", "dist");
}

/**
 * Only what the browser uses. `node.mjs` is the Node build and the `.d.mts` files
 * are types. The async proxy belongs to the `"opfs"` VFS; we install
 * `"opfs-sahpool"`, which does not need it.
 */
const FILES = ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"];

/** Ceiling for the engine, on the compressed payload the browser fetches. */
const BUDGET = { wasmGzip: 450_000, totalGzip: 760_000 };

const source = findPackage();
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const name of FILES) {
  cpSync(join(source, name), join(outDir, name));
}

const gzip = (file) => gzipSync(readFileSync(file), { level: 9 }).byteLength;

let total = 0;
for (const name of FILES) {
  const size = gzip(join(outDir, name));
  total += size;
  console.log(`  ${String(size).padStart(7)}  ${name}`);
}

const wasm = gzip(join(outDir, "sqlite3.wasm"));
if (wasm > BUDGET.wasmGzip) {
  throw new Error(`sqlite3.wasm is ${wasm} gzip, budget ${BUDGET.wasmGzip}.`);
}
if (total > BUDGET.totalGzip) {
  throw new Error(`SQLite runtime is ${total} gzip, budget ${BUDGET.totalGzip}.`);
}

console.log(`sqlite runtime: ${total} gzip (budget ${BUDGET.totalGzip}) — ok`);
console.log(`published into ${outDir}`);
