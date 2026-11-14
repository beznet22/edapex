#!/usr/bin/env node
/**
 * Vendor the SQLite WASM engine into `public/sqlite/`.
 *
 * Served as static assets rather than bundled: the engine locates its own
 * `.wasm` and worker scripts by URL at runtime, and a bundler rewriting those
 * paths is how this works in dev and breaks in production.
 *
 * The copy is not committed. It is generated here and in CI, and the size gate
 * below fails the build rather than letting the engine grow unnoticed — the same
 * reason the agent runtime has one.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(
  root,
  "..",
  "..",
  "node_modules",
  ".pnpm",
  ...findPackage(root)
);
const outDir = join(root, "public", "sqlite");

/** Locates the hoisted pnpm package without hard-coding a version hash. */
function findPackage(appRoot) {
  const store = join(appRoot, "..", "..", "node_modules", ".pnpm");
  const entry = readdirSync(store).find((name) => name.startsWith("@sqlite.org+sqlite-wasm@"));
  if (entry === undefined) {
    throw new Error("Install @sqlite.org/sqlite-wasm before building the SQLite runtime.");
  }
  return [entry, "node_modules", "@sqlite.org", "sqlite-wasm", "dist"];
}

/**
 * Only the browser pieces. `node.mjs` is the Node build and the `.d.mts` files
 * are types: shipping either would be dead weight.
 */
const FILES = [
  "index.mjs",
  "sqlite3.wasm",
  "sqlite3-worker1.mjs",
  "sqlite3-opfs-async-proxy.js"
];

/**
 * Compressed ceiling for the lazy engine, approved at ~1.2 MB.
 *
 * It is fetched only when the store is opened, never on first paint, and so sits
 * outside the initial-JS budget in `budget.json`. Measured at 774,893 gzip.
 */
const BUDGET = { wasmGzip: 500_000, totalGzip: 1_200_000 };

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
console.log(`vendored into ${outDir}`);
