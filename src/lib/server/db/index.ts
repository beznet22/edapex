import { env } from "$env/dynamic/private";
import mysql from "mysql2/promise";
import { drizzle as drizzleMySQL } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2/driver";
import * as schema from "./schema";
import * as relations from "./relations";

export type MySQLDrizzleClient = MySql2Database<typeof schema & typeof relations>;

let pool: mysql.Pool | null = null;
let poolV2: mysql.Pool | null = null;

/** Cached promise so getDatabase() always returns a Promise. */
let dbInstancePromise: Promise<MySQLDrizzleClient> | null = null;

/**
 * Return a Promise that resolves to a cached drizzle client.
 * Safe to call concurrently; the Promise prevents races.
 */
export async function getDatabase(): Promise<MySQLDrizzleClient> {
  if (!dbInstancePromise) {
    dbInstancePromise = Promise.resolve(connectMySQL());
  }
  return dbInstancePromise;
}

/**
 * Synchronously create mysql2 pool and drizzle client.
 * Kept synchronous because it only constructs objects.
 */
export function connectMySQL(): MySQLDrizzleClient {
  if (!pool) {
    const dbUrl = env.DATABASE_V2_URL || env.DATABASE_URL;
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

/**
 * Fallback helper for V2 naming (Authoritative transition)
 * @deprecated Use getDatabase() directly.
 */
export async function getDatabaseV2(): Promise<MySQLDrizzleClient> {
  return getDatabase();
}


/**
 * Gracefully close the MySQL pool (useful for tests, CLI, or HMR).
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      // swallow errors on shutdown; optionally log during debugging
      // console.warn("Error closing DB pool:", err);
    }
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

/** Clear cache without closing pool (rarely used). */
export function clearDatabaseCache(): void {
  dbInstancePromise = null;
}

/**
 * Vite / SvelteKit HMR cleanup:
 * When the module is replaced during hot-reload, this will close the pool to prevent
 * "too many connections" errors caused by repeatedly creating pools during dev.
 *
 * The `import.meta.hot` API exists only in dev/HMR; guard to avoid TS errors at runtime.
 */

if (import.meta?.hot) {
  import.meta.hot.accept?.();

  // On dispose, close the pool (fire-and-forget)
  import.meta.hot.dispose?.(() => {
    closeDatabase().catch(() => { });
  });
}
