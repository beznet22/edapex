#!/usr/bin/env node
/**
 * Read-only MySQL introspection for the D1 port.
 *
 * Answers the questions the migration plan depends on, instead of assuming:
 *   - which indexes exist in MySQL but are NOT declared in the Drizzle schema
 *     (drizzle-kit would generate a D1 schema without them)
 *   - exact column counts, to catch tables over D1's 100-column cap
 *   - row counts and physical size, against D1's 500 MB / 10 GB ceilings
 *   - foreign keys present in the database but absent from the schema
 *   - the transitive FK closure of the ported table set
 *
 * Safety: this script issues SELECT and SHOW only. It never writes to the
 * database. Credentials come from .env (DATABASE_URL) and are never printed.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

import {
  columnChunks,
  parseColumn,
  parseReferences,
  parseTableForeignKeys,
  parseTables
} from "./lib/schema-parse.mjs";

const SCHEMA = "src/lib/server/db/sms-schema.ts";
const USAGE = "docs/cloudflare-port/audit/schema-usage.json";
const OUT = "docs/cloudflare-port/audit/db-inventory.json";

/** Parse a mysql:// DSN. Passwords may contain '@', so the password group is greedy. */
function parseDsn(dsn) {
  const m = /^mysql:\/\/([^:@/]+):(.*)@([^:@/]+):(\d+)\/([^?]+)/.exec(dsn);
  if (!m) throw new Error("DATABASE_URL is not a mysql:// DSN with host:port/database");
  return {
    user: m[1],
    password: m[2],
    host: m[3],
    port: Number(m[4]),
    database: m[5].split("/")[0]
  };
}

const redact = ({ user, host, port, database }) => `mysql://${user}:***@${host}:${port}/${database}`;

/** Build var -> Set(targetVar) from the Drizzle schema, both FK styles. */
function buildFkGraph(source, tables) {
  const graph = new Map();
  for (const t of tables) {
    const body = source.slice(t.bodyStart + 1, t.bodyEnd);
    const targets = new Set();
    for (const chunk of columnChunks(body)) {
      for (const ref of parseReferences(chunk.text)) targets.add(ref.targetVar);
    }
    for (const fk of parseTableForeignKeys(body)) targets.add(fk.targetVar);
    graph.set(t.var, targets);
  }
  return graph;
}

/** Index/unique names declared inside each table body. */
function drizzleIndexNames(source, t) {
  const body = source.slice(t.bodyStart + 1, t.bodyEnd);
  const names = new Set();
  for (const m of body.matchAll(/\b(?:index|unique)\(\s*["']([^"']+)["']/g)) names.add(m[1]);
  return names;
}

async function main() {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) throw new Error("DATABASE_URL is not set (expected in .env)");
  const cfg = parseDsn(dsn);

  const source = fs.readFileSync(SCHEMA, "utf8");
  const allTables = parseTables(source);
  const used = JSON.parse(fs.readFileSync(USAGE, "utf8"));
  const usedVars = new Set(used.map((u) => u.var));
  const byVar = new Map(allTables.map((t) => [t.var, t]));
  const graph = buildFkGraph(source, allTables);

  // Transitive FK closure of the used set — tables D1 must create for constraints.
  const closure = new Set();
  const queue = [...usedVars];
  while (queue.length > 0) {
    const v = queue.pop();
    for (const target of graph.get(v) ?? []) {
      if (usedVars.has(target) || closure.has(target)) continue;
      closure.add(target);
      queue.push(target);
    }
  }
  const portVars = [...usedVars, ...closure];

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectTimeout: 10000
  });

  const [versionRow] = await conn.query("SELECT VERSION() AS v, DATABASE() AS d");
  const [[{ n: schemaTableCount }]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
  );

  const [columnRows] = await conn.query(
    `SELECT TABLE_NAME AS t, COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME`
  );
  const columnCount = new Map(columnRows.map((r) => [r.t, Number(r.c)]));

  const [sizeRows] = await conn.query(
    `SELECT TABLE_NAME AS t, TABLE_ROWS AS rows_est, DATA_LENGTH AS data_bytes, INDEX_LENGTH AS index_bytes
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`
  );
  const sizeByName = new Map(sizeRows.map((r) => [r.t, r]));

  const [statRows] = await conn.query(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, NON_UNIQUE AS nu, SEQ_IN_INDEX AS seq, COLUMN_NAME AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`
  );
  const indexesByTable = new Map();
  for (const r of statRows) {
    if (!indexesByTable.has(r.t)) indexesByTable.set(r.t, new Map());
    const perTable = indexesByTable.get(r.t);
    if (!perTable.has(r.i)) perTable.set(r.i, { name: r.i, unique: Number(r.nu) === 0, columns: [] });
    perTable.get(r.i).columns.push(r.c);
  }

  const [fkRows] = await conn.query(
    `SELECT k.CONSTRAINT_NAME AS name, k.TABLE_NAME AS t, k.COLUMN_NAME AS c,
            k.REFERENCED_TABLE_NAME AS rt, k.REFERENCED_COLUMN_NAME AS rc
       FROM information_schema.KEY_COLUMN_USAGE k
      WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME`
  );

  const tables = [];
  for (const v of portVars) {
    const table = byVar.get(v);
    if (!table) continue;
    const name = table.dbName;

    // Exact row count only for the ported set; estimates are enough elsewhere.
    let rows = null;
    try {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
      rows = Number(n);
    } catch {
      rows = null;
    }

    const dbIndexes = [...(indexesByTable.get(name)?.values() ?? [])].filter((i) => i.name !== "PRIMARY");
    const declared = drizzleIndexNames(source, table);
    const missingFromSchema = dbIndexes.filter((i) => !declared.has(i.name));

    tables.push({
      var: v,
      dbName: name,
      inCatalog: usedVars.has(v),
      inClosure: closure.has(v),
      columns: columnCount.get(name) ?? null,
      rows,
      rowsEstimate: Number(sizeByName.get(name)?.rows_est ?? 0),
      dataBytes: Number(sizeByName.get(name)?.data_bytes ?? 0),
      indexBytes: Number(sizeByName.get(name)?.index_bytes ?? 0),
      dbIndexes: dbIndexes.map((i) => ({ name: i.name, unique: i.unique, columns: i.columns })),
      declaredIndexes: [...declared],
      indexesMissingFromSchema: missingFromSchema.map((i) => ({ name: i.name, unique: i.unique, columns: i.columns })),
      dbForeignKeys: fkRows.filter((f) => f.t === name).map((f) => ({ name: f.name, column: f.c, target: f.rt, targetColumn: f.rc }))
    });
  }

  await conn.end();

  const overColumnCap = tables.filter((t) => (t.columns ?? 0) > 100);
  const totalBytes = sizeRows.reduce((n, r) => n + Number(r.data_bytes) + Number(r.index_bytes), 0);
  const portedBytes = tables.reduce((n, t) => n + t.dataBytes + t.indexBytes, 0);
  const missingIndexTotal = tables.reduce((n, t) => n + t.indexesMissingFromSchema.length, 0);
  const tablesWithNoIndex = tables.filter((t) => t.dbIndexes.length === 0);
  const dbFkCount = fkRows.length;

  const report = {
    connection: redact(cfg),
    serverVersion: versionRow[0].v,
    database: versionRow[0].d,
    generatedAt: new Date().toISOString(),
    schemaTableCount,
    portedTableCount: tables.length,
    catalogTableCount: usedVars.size,
    closureTableCount: closure.size,
    closure: [...closure].sort(),
    totals: {
      allTablesBytes: totalBytes,
      portedBytes,
      indexesInDb: statRows.length,
      indexesMissingFromSchema: missingIndexTotal,
      foreignKeysInDb: dbFkCount,
      tablesWithNoIndex: tablesWithNoIndex.map((t) => t.dbName)
    },
    overColumnCap: overColumnCap.map((t) => ({ dbName: t.dbName, columns: t.columns })),
    tables: tables.sort((a, b) => b.dataBytes + b.indexBytes - (a.dataBytes + a.indexBytes))
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

  const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  console.log(`connected: ${report.connection} (MySQL ${report.serverVersion})`);
  console.log(`tables in schema: ${schemaTableCount}`);
  console.log(`catalog set: ${usedVars.size} | FK closure adds: ${closure.size} | ported total: ${tables.length}`);
  console.log(`closure: ${[...closure].sort().join(", ") || "none"}`);
  console.log(`total dataset: ${mb(totalBytes)} | ported subset: ${mb(portedBytes)}`);
  console.log(`indexes in DB: ${statRows.length} keys | declared in schema: ${tables.reduce((n, t) => n + t.declaredIndexes.length, 0)} | missing from schema: ${missingIndexTotal}`);
  console.log(`tables with zero secondary indexes: ${tablesWithNoIndex.length}`);
  console.log(`foreign keys in DB: ${dbFkCount}`);
  console.log(`tables over D1 100-column cap: ${overColumnCap.length ? overColumnCap.map((t) => `${t.dbName}(${t.columns})`).join(", ") : "none"}`);
  console.log("\nlargest ported tables:");
  for (const t of report.tables.slice(0, 12)) {
    console.log(`  ${t.dbName.padEnd(32)} rows=${String(t.rows ?? "?").padStart(8)} cols=${String(t.columns).padStart(3)} size=${mb(t.dataBytes + t.indexBytes)} indexes=${t.dbIndexes.length} missing=${t.indexesMissingFromSchema.length}`);
  }
  console.log(`\nwrote ${OUT}`);
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
