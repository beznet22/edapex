#!/usr/bin/env node
/**
 * Enforce `apps/web/budget.json` against a real build.
 *
 * Measuring "every .js file in the output" is wrong: it counts lazily imported
 * chunks that never load on first paint. The Tiptap editor alone is 188 KB gzip
 * and only arrives when the artifact panel opens, so including it would report a
 * failure no user experiences.
 *
 * This walks the Vite manifest instead: the browser entry plus the route's client
 * references, transitively through static imports. `dynamicImports` are excluded
 * for the same reason — they are not initial.
 *
 * A missing build is a failure, not a skip. A budget that passes when nothing was
 * built protects nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const appRoot = new URL("..", import.meta.url).pathname;
const budget = JSON.parse(readFileSync(join(appRoot, "budget.json"), "utf8"));

const ASSET_DIRS = [
  ".cloudflare/output/v0/workers/default/assets",
  "dist/client",
  "dist"
];

const assets = ASSET_DIRS.map((dir) => join(appRoot, dir)).find((dir) => {
  try {
    return statSync(join(dir, ".vite", "manifest.json")).isFile();
  } catch {
    return false;
  }
});

if (assets === undefined) {
  console.error(
    `No build manifest found. Looked for .vite/manifest.json under:\n  ${ASSET_DIRS.join("\n  ")}\n` +
      "Run the web build before checking budgets."
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(assets, ".vite", "manifest.json"), "utf8"));

/** Resolve short import keys (`_chunk.js`) to manifest keys. */
const resolveKey = (key) => {
  if (!key.startsWith("_")) return key;
  const short = key.slice(1);
  return Object.keys(manifest).find((candidate) => candidate.endsWith(short)) ?? key;
};

const gzipSize = (file) => {
  try {
    return gzipSync(readFileSync(join(assets, file)), { level: 9 }).byteLength;
  } catch {
    return 0;
  }
};

/**
 * Static-import closure of a set of roots.
 *
 * `dynamicImports` are skipped (not initial) but `css` is included: stylesheets
 * live in that array rather than in `imports`, so omitting it reports 0 KB CSS.
 */
const closure = (roots) => {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const key = resolveKey(stack.pop());
    if (seen.has(key) || manifest[key] === undefined) continue;
    seen.add(key);
    stack.push(...(manifest[key].imports ?? []), ...(manifest[key].css ?? []));
  }
  return seen;
};

const entry = Object.keys(manifest).find(
  (key) => manifest[key].isEntry === true && key.includes("app-browser-entry")
);
if (entry === undefined) {
  console.error("The browser entry is missing from the Vite manifest.");
  process.exit(1);
}

// Client references for the workspace surface, matched by component name because
// their file names are content-hashed.
const ROUTE_COMPONENTS = ["WorkspaceChat", "WorkspaceLayoutClient", "ServiceWorkerRegistration"];
const routeRoots = Object.keys(manifest).filter((key) =>
  ROUTE_COMPONENTS.some((name) => key.includes(`/${name}`))
);

const files = closure([entry, ...routeRoots]);
const perFile = [...files]
  .map((key) => ({ file: manifest[key].file, size: gzipSize(manifest[key].file) }))
  .sort((a, b) => b.size - a.size);

const jsTotal = perFile
  .filter((chunk) => chunk.file.endsWith(".js") && !chunk.file.includes("agent-runtime"))
  .reduce((sum, chunk) => sum + chunk.size, 0);

// The bundler emits stylesheets as standalone files and does not reference them
// from the manifest, so they are collected directly. There is one per app today;
// if that changes this still sums all of them, which errs conservative.
const collectCss = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectCss(full));
    else if (entry.name.endsWith(".css")) found.push(full);
  }
  return found;
};

const cssTotal = collectCss(assets).reduce(
  (sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).byteLength,
  0
);

const initial = budget.routes["/workspace"];
const failures = [];

const report = (label, actual, limit) => {
  const ok = actual <= limit;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual} / ${limit} gzip`);
  if (!ok) failures.push(label);
};

console.log("Initial payload (entry + route references, static imports only):");
for (const chunk of perFile.slice(0, 6)) {
  console.log(`       ${String(chunk.size).padStart(7)}  ${chunk.file}`);
}
console.log("");

report("initial JS", jsTotal, initial.initialJsGzip);
report("initial CSS", cssTotal, initial.initialCssGzip);

/**
 * The part of the payload this team controls.
 *
 * The total is dominated by React 19 + vinext, which nobody here can shrink by
 * writing code differently. Budgeting only the total lets a framework upgrade
 * silently consume the entire allowance, and a team that can never pass a budget
 * stops reading it. This isolates app code, icons and route chunks.
 */
const controllable = jsTotal - budget.frameworkFloorGzip;
if (controllable < 0) {
  console.log(
    `       WARNING: total is below the recorded framework floor ` +
      `(${budget.frameworkFloorGzip}) — re-measure it in budget.json`
  );
}
report("controllable JS", controllable, initial.controllableJsGzip);

// Lazily loaded assets get their own ceiling: off the initial path, but still
// bounded, because an unbounded lazy chunk is how 9.9 MB shipped unnoticed.
for (const [assetPath, limit] of Object.entries(budget.assets)) {
  if (assetPath.startsWith("$")) continue;
  const relative = assetPath.replace(/^\//, "");
  const chunk = Object.keys(manifest).find((key) => manifest[key].file.endsWith(relative));
  if (chunk === undefined) continue;
  report(relative, gzipSize(manifest[chunk].file), limit.gzip);
}

if (failures.length > 0) {
  console.error(`\nOver budget: ${failures.join(", ")}`);
  console.error(
    "A miss blocks release unless a recorded exception with an owner and\n" +
      "follow-up exists in docs/workspace/specs/47-performance-budgets.md."
  );
  process.exit(1);
}

console.log("\nBudgets satisfied.");
