#!/usr/bin/env node
/**
 * Derives the D1 load order for the ported table set.
 *
 * Reference/master data must load before user data, and user data before
 * transactional rows, because D1 enforces foreign keys unconditionally.
 * This computes the actual dependency tiers from the schema's FK graph
 * rather than relying on a hand-written list.
 */
import fs from "node:fs";
import {
  columnChunks,
  parseColumn,
  parseReferences,
  parseTableForeignKeys,
  parseTables
} from "./lib/schema-parse.mjs";

const SCHEMA = "src/lib/server/db/sms-schema.ts";
const BASE_SCHEMA = "src/lib/server/db/schema.ts";
const USAGE = ".kimchi/docs/schema-usage.json";
const OUT = ".kimchi/docs/migration-order.md";

const src = fs.readFileSync(SCHEMA, "utf8");
const all = parseTables(src);
const used = new Set(JSON.parse(fs.readFileSync(USAGE, "utf8")).map((u) => u.var));

/** var -> Set(dependency var) from both FK declaration styles. */
const AUDIT = new Set(["createdBy", "updatedBy", "created_by", "updated_by"]);
const deps = new Map();
for (const t of all) {
  const body = src.slice(t.bodyStart + 1, t.bodyEnd);
  const set = new Set();
  for (const chunk of columnChunks(body)) {
    if (AUDIT.has(parseColumn(chunk).key)) continue;
    for (const ref of parseReferences(chunk.text)) {
      if (ref.targetVar !== t.var) set.add(ref.targetVar);
    }
  }
  for (const fk of parseTableForeignKeys(body)) {
    if (AUDIT.has(fk.column)) continue;
    if (fk.targetVar !== t.var) set.add(fk.targetVar);
  }
  deps.set(t.var, set);
}

// Transitive closure of FK targets reachable from the used set.
const closure = new Set();
const queue = [...used];
while (queue.length > 0) {
  const v = queue.pop();
  for (const dep of deps.get(v) ?? []) {
    if (used.has(dep) || closure.has(dep)) continue;
    closure.add(dep);
    queue.push(dep);
  }
}

const ported = new Set([...used, ...closure]);
const tables = all.filter((t) => ported.has(t.var));
const byVar = new Map(tables.map((t) => [t.var, t]));

/** Edges restricted to the ported set; ai_sessions is handled separately. */
const edges = new Map();
const rdeps = new Map();
for (const t of tables) {
  const direct = [...(deps.get(t.var) ?? [])].filter((d) => ported.has(d));
  edges.set(t.var, direct);
  for (const d of direct) {
    if (!rdeps.has(d)) rdeps.set(d, []);
    rdeps.get(d).push(t.var);
  }
}

// Longest-path levelling (Kahn-style), which also detects cycles.
const level = new Map();
const remaining = new Set(tables.map((t) => t.var));
let progress = true;
let guard = 0;
while (remaining.size > 0 && progress && guard < 50) {
  progress = false;
  guard += 1;
  for (const v of [...remaining]) {
    const depsLeft = edges.get(v).filter((d) => remaining.has(d));
    if (depsLeft.length === 0) {
      const lvl = edges.get(v).reduce((max, d) => Math.max(max, (level.get(d) ?? -1) + 1), 0);
      level.set(v, lvl);
      remaining.delete(v);
      progress = true;
    }
  }
}

const cyclic = [...remaining];

const tiers = new Map();
for (const [v, lvl] of level) {
  if (!tiers.has(lvl)) tiers.set(lvl, []);
  tiers.get(lvl).push(v);
}
for (const list of tiers.values()) list.sort((a, b) => byVar.get(a).dbName.localeCompare(byVar.get(b).dbName));

const labels = {
  0: "Root tenant",
  1: "Reference / configuration",
  2: "Academic structure",
  3: "People (identity → profiles)",
  4: "Enrolment & assignments",
  5: "Operational / assessment",
  6: "Transactional"
};

const lines = [];
lines.push("# Migration load order (derived from FK graph)\n");
lines.push(`Ported tables: ${tables.length} SMS tables + \`ai_sessions\` (separate, depends on \`users\`).`);
lines.push(`Cycle-participating tables: ${cyclic.length === 0 ? "none" : cyclic.join(", ")}\n`);

for (const lvl of [...tiers.keys()].sort((a, b) => a - b)) {
  lines.push(`## Tier ${lvl} — ${labels[lvl] ?? "dependent"}\n`);
  lines.push("| # | Table | DB name | Depends on |");
  lines.push("|---|---|---|---|");
  tiers.get(lvl).forEach((v, i) => {
    const t = byVar.get(v);
    const direct = edges.get(v).map((d) => byVar.get(d).dbName);
    lines.push(`| ${i + 1} | \`${v}\` | \`${t.dbName}\` | ${direct.length === 0 ? "—" : direct.join(", ")} |`);
  });
  lines.push("");
}

fs.writeFileSync(OUT, lines.join("\n"));

console.log(`ported SMS tables: ${tables.length}`);
console.log(`cycles: ${cyclic.length === 0 ? "none" : cyclic.join(", ")}`);
for (const lvl of [...tiers.keys()].sort((a, b) => a - b)) {
  console.log(`\nTier ${lvl} (${labels[lvl] ?? "dependent"}) — ${tiers.get(lvl).length}`);
  console.log("  " + tiers.get(lvl).map((v) => byVar.get(v).dbName).join(", "));
}
console.log(`\nwrote ${OUT}`);
