/**
 * Browser SQLite engine.
 *
 * The engine is a vendored asset, not a bundle dependency: it locates its own
 * `.wasm` and worker scripts relative to `index.mjs`, and letting a bundler
 * rewrite those paths is how this works in dev and breaks in production.
 *
 * It is fetched only when the store is opened, never on first paint, so it sits
 * outside the initial-JS budget. See `scripts/build-sqlite-runtime.mjs`.
 *
 * The interface is deliberately synchronous, because `sqlite3.oo1` is. That is
 * what lets the Rust `SqlDriver` call into it without an executor or a promise
 * queue, and therefore what lets desktop and the browser share one store
 * implementation.
 */

export type SqlBind = null | number | string | Uint8Array;
export type SqlRow = readonly SqlBind[];

export interface SqlExecutor {
  executeBatch(sql: string): void;
  execute(sql: string, params: readonly SqlBind[]): number;
  query(sql: string, params: readonly SqlBind[]): SqlRow[];
  begin(): void;
  commit(): void;
  rollback(): void;
  close(): void;
}

interface SqlQueryOptions {
  readonly sql: string;
  readonly bind?: readonly SqlBind[];
  readonly rowMode?: "array";
  readonly returnValue?: "resultRows";
}

type Oo1Db = {
  // Overloaded in the engine: a bare SQL string, or an options object.
  readonly exec: {
    (sql: string): unknown;
    (options: SqlQueryOptions): unknown;
  };
  readonly changes: () => number;
  readonly close: () => void;
};

interface SqliteModule {
  readonly oo1: {
    readonly DB: new (filename?: string) => Oo1Db;
    readonly OpfsDb?: new (filename: string) => Oo1Db;
  };
  readonly capi: { readonly sqlite3_vfs_find: (name: string) => unknown };
}

let modulePromise: Promise<SqliteModule> | null = null;

async function loadSqlite(): Promise<SqliteModule> {
  if (modulePromise !== null) return modulePromise;
  modulePromise = (async () => {
    const specifier = new URL("/sqlite/index.mjs", window.location.origin).href;
    const module = (await import(/* @vite-ignore */ specifier)) as {
      default: () => Promise<SqliteModule>;
    };
    return module.default();
  })();
  return modulePromise;
}

/**
 * Opens the store database.
 *
 * OPFS is preferred: it is a real file in the origin private file system, so the
 * database survives a reload without rewriting the whole file on every change.
 * Without OPFS the database is in-memory and does not persist — a caller must
 * treat that as "offline storage unavailable" rather than silently losing data
 * on reload.
 */
export async function openBrowserSqlite(options: {
  readonly filename?: string;
} = {}): Promise<SqlExecutor & { readonly persistent: boolean }> {
  const sqlite3 = await loadSqlite();
  const filename = options.filename ?? "/edapex-agent.db";

  const opfsAvailable =
    sqlite3.oo1.OpfsDb !== undefined &&
    typeof navigator !== "undefined" &&
    navigator.storage !== undefined &&
    typeof navigator.storage.getDirectory === "function";

  const db: Oo1Db =
    opfsAvailable && sqlite3.oo1.OpfsDb !== undefined
      ? new sqlite3.oo1.OpfsDb(filename)
      : new sqlite3.oo1.DB(filename);

  // WAL is what allows the transcript to keep reading while a turn persists.
  // OPFS supports it; the in-memory fallback ignores the pragma harmlessly.
  try {
    db.exec("PRAGMA journal_mode = WAL");
  } catch {
    // A VFS without WAL support is not a failure.
  }
  db.exec("PRAGMA foreign_keys = ON");

  return {
    persistent: opfsAvailable,

    executeBatch(sql: string): void {
      db.exec(sql);
    },

    execute(sql: string, params: readonly SqlBind[]): number {
      db.exec({ sql, bind: params });
      return db.changes();
    },

    query(sql: string, params: readonly SqlBind[]): SqlRow[] {
      const rows = db.exec({ sql, bind: params, rowMode: "array", returnValue: "resultRows" });
      return Array.isArray(rows) ? (rows as SqlRow[]) : [];
    },

    begin(): void {
      db.exec("BEGIN IMMEDIATE");
    },

    commit(): void {
      db.exec("COMMIT");
    },

    rollback(): void {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Rolling back a transaction that already ended must not mask the
        // original error the caller is reporting.
      }
    },

    close(): void {
      db.close();
    }
  };
}
