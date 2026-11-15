#!/usr/bin/env node
/**
 * Generates 03b — the endpoint inventory for the HTTP layer spec.
 *
 * For every SvelteKit endpoint and remote function, records the route path,
 * exported methods, which data layer it touches, whether it reads the session,
 * and whether it is in scope for the Hono port.
 *
 * Scope rule: in scope if the request needs catalog data, even when it also
 * touches app-db. App-only endpoints are listed as out of scope.
 */
import fs from "node:fs";
import path from "node:path";

const ROUTES = "src/routes";
const API_DIR = "src/lib/api";
const OUT = "docs/cloudflare-port/03b-endpoint-map.md";

const CATALOG_PATTERNS = [
  "server/repository",
  "db/sms-schema",
  "service/assessment",
  "service/settings",
  "service/assessment-publisher",
  "service/assessment-ocr"
];
const APP_PATTERNS = ["app-db", "mastra", "provider/availability", "libsql"];

const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === "+server.ts" || entry.name.endsWith(".remote.ts")) acc.push(full);
  }
  return acc;
};

const toRoute = (file) => {
  if (file.endsWith(".remote.ts")) return `rpc:${path.basename(file, ".remote.ts")}`;
  const route = file
    .replace(/^src\/routes/, "")
    .replace(/\/\+server\.ts$/, "")
    .replace(/\(([^)]+)\)\//g, "");
  return route.length === 0 ? "/" : route;
};

const domainOf = (route) => {
  const stripped = route.replace(/^rpc:/, "");
  const seg = stripped.replace(/^\//, "").split("/")[0] || "root";
  return seg === "api" ? stripped.replace(/^\/?api\/?/, "").split("/")[0] || "api" : seg;
};

const rows = [];
for (const file of walk(ROUTES).concat(walk(API_DIR)).sort()) {
  const src = fs.readFileSync(file, "utf8");
  const methods = [
    ...src.matchAll(/export\s+(?:const\s+|(?:async\s+)?function\s+)(GET|POST|PUT|PATCH|DELETE)\b/g)
  ].map((m) => m[1]);
  const remoteExports = [...src.matchAll(/export const (\w+)\s*=\s*(query|form|command)\b/g)].map(
    (m) => `${m[1]} (${m[2]})`
  );

  const catalog =
    CATALOG_PATTERNS.some((p) => src.includes(p)) ||
    // Auth routes reach catalog tables via auth.service/authRepo; the service
    // import alone is too broad a signal, since nearly every route has it.
    /(^|\/)\(auth\)|(^|\/)(login|signout|google)/i.test(file);
  const app = APP_PATTERNS.some((p) => src.includes(p));
  const auth = /locals\.(user|session)/.test(src);

  const route = toRoute(file);
  const scope = catalog ? (app ? "in (mixed)" : "in") : "out";

  rows.push({
    file,
    route,
    methods: methods.length > 0 ? methods.join(", ") : remoteExports.join(", ") || "—",
    domain: domainOf(route),
    catalog,
    app,
    auth,
    scope
  });
}

const handlerCount = rows.reduce(
  (n, r) => n + r.methods.split(", ").filter((m) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(m)).length,
  0
);

const byScope = {
  in: rows.filter((r) => r.scope === "in").length,
  mixed: rows.filter((r) => r.scope === "in (mixed)").length,
  out: rows.filter((r) => r.scope === "out").length
};

const table = rows
  .map(
    (r) =>
      `| \`${r.route}\` | ${r.methods} | ${r.domain} | ${r.catalog ? "yes" : "no"} | ${r.app ? "yes" : "no"} | ${r.auth ? "yes" : "no"} | ${r.scope} |`
  )
  .join("\n");

const doc = `# 03b — Endpoint Inventory

Every SvelteKit endpoint and remote function, classified for the Hono port.

**Generated** by \`scripts/gen-endpoint-map.mjs\`. Regenerate after changing routes:

\`\`\`bash
node scripts/gen-endpoint-map.mjs
\`\`\`

## Summary

| Metric | Value |
|---|---|
| Files scanned | ${rows.length} |
| Endpoint handler exports | ${handlerCount} |
| In scope (catalog only) | ${byScope.in} |
| In scope (mixed catalog + app-db) | ${byScope.mixed} |
| Out of scope (app-db/Mastra only) | ${byScope.out} |

**Scope rule:** in scope when the request needs catalog data, even if it also touches app-db.

## Full inventory

| Route | Methods | Domain | Catalog | App DB | Auth | Scope |
|---|---|---|---|---|---|---|
${table}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, doc);

console.log(`wrote ${OUT}`);
console.log(`files: ${rows.length} | handler exports: ${handlerCount}`);
console.log(`in: ${byScope.in} | mixed: ${byScope.mixed} | out: ${byScope.out}`);
for (const r of rows.filter((x) => x.scope !== "out")) {
  console.log(`  ${r.scope.padEnd(10)} ${r.route.padEnd(44)} ${r.methods}`);
}
