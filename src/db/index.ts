import { drizzle as drizzleMySQL } from "drizzle-orm/mysql2";
import { drizzle as drizzlePG } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSQLite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as mysql from "mysql2/promise";
import { Pool as PgPool } from "pg";
import Database from "better-sqlite3";

import * as mysqlSchema from "./mysql/schema";
import * as postgresSchema from "./postgres/schema";
import * as sqliteSchema from "./sqlite/schema";
import * as d1Schema from "./d1/schema";

export type DrizzleDB = any; // Generic fallback to allow multiple dialects in the same codebase

let dbInstance: any = null;

export function getDatabaseV2(env?: any): DrizzleDB {
  // Cloudflare D1 Detection
  if (env?.D1_DB) {
    return drizzleD1(env.D1_DB, { schema: d1Schema });
  }

  if (dbInstance) return dbInstance;

  const dialect = process.env.DATABASE_DIALECT || "mysql";
  const url = process.env.DATABASE_URL || "";

  if (dialect === "postgres") {
    const pool = new PgPool({ connectionString: url });
    dbInstance = drizzlePG(pool, { schema: postgresSchema });
  } else if (dialect === "sqlite") {
    const sqlite = new Database(url);
    dbInstance = drizzleSQLite(sqlite, { schema: sqliteSchema });
  } else if (dialect === "d1") {
    // Fallback for D1 if env is not passed but global is available (unlikely in Workers)
    if (typeof (globalThis as any).D1_DB !== "undefined") {
        dbInstance = drizzleD1((globalThis as any).D1_DB, { schema: d1Schema });
    }
  } else {
    // Default: MySQL
    const pool = mysql.createPool({ uri: url });
    dbInstance = drizzleMySQL(pool, { schema: mysqlSchema, mode: "default" });
  }

  return dbInstance || (null as any);
}

// In standard Node.js environments, this will initialize via process.env
// In Workers, the middleware should call getDatabaseV2(c.env)
export const db = getDatabaseV2();

