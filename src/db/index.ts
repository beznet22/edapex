import { drizzle as drizzleMySQL } from "drizzle-orm/mysql2";
import { drizzle as drizzlePG } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSQLite } from "drizzle-orm/better-sqlite3";
import mysql from "mysql2/promise";
import { Pool as PgPool } from "pg";
import Database from "better-sqlite3";

import * as mysqlSchema from "./mysql/schema";
import * as postgresSchema from "./postgres/schema";
import * as sqliteSchema from "./sqlite/schema";

export type DrizzleDB = any; // Generic fallback to allow multiple dialects in the same codebase

let dbInstance: any = null;

export function getDatabaseV2(): DrizzleDB {
  if (dbInstance) return dbInstance;

  const dialect = process.env.DATABASE_DIALECT || "mysql";
  const url = process.env.DATABASE_URL || "";

  if (dialect === "postgres") {
    const pool = new PgPool({ connectionString: url });
    dbInstance = drizzlePG(pool, { schema: postgresSchema });
  } else if (dialect === "sqlite") {
    const sqlite = new Database(url);
    dbInstance = drizzleSQLite(sqlite, { schema: sqliteSchema });
  } else {
    // Default: MySQL
    const pool = mysql.createPool({ uri: url });
    dbInstance = drizzleMySQL(pool, { schema: mysqlSchema, mode: "default" });
  }

  return dbInstance;
}

export const db = getDatabaseV2();

