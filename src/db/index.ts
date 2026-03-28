import mysql from "mysql2/promise";
import { drizzle as drizzleMySQL } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2/driver";
import * as schema from "./schema";
import * as relations from "./relations";

export type MySQLDrizzleClient = MySql2Database<typeof schema & typeof relations>;

let pool: mysql.Pool | null = null;
let poolV2: mysql.Pool | null = null;

let dbInstancePromise: Promise<MySQLDrizzleClient> | null = null;

export async function getDatabase(): Promise<MySQLDrizzleClient> {
  if (!dbInstancePromise) {
    dbInstancePromise = Promise.resolve(connectMySQL());
  }
  return dbInstancePromise;
}

export function connectMySQL(): MySQLDrizzleClient {
  if (!pool) {
    const dbUrl = process.env.DATABASE_V2_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("Missing database connection URL.");
    }

    pool = mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  const client = drizzleMySQL(pool, {
    schema: { ...schema, ...relations },
    mode: "default",
  });

  return client;
}

export async function getDatabaseV2(): Promise<MySQLDrizzleClient> {
  return getDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (err) { }
    pool = null;
  }
  if (poolV2) {
    try {
      await poolV2.end();
    } catch (err) { }
    poolV2 = null;
  }
  dbInstancePromise = null;
}

export function clearDatabaseCache(): void {
  dbInstancePromise = null;
}
