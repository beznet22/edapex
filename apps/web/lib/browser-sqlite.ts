/**
 * The browser SQL engine: official SQLite WASM with the OPFS-SAHpool VFS.
 *
 * Chosen over wa-sqlite because published wa-sqlite builds exclude FTS5 and
 * upstream deliberately does not publish custom builds; a local Emscripten
 * pipeline is a permanent maintenance cost. This engine ships FTS5, and
 * `opfs-sahpool` is derived from wa-sqlite's AccessHandlePoolVFS — so the
 * single-writer semantics our Web Lock lease already enforces still hold.
 *
 * Everything engine-specific stops here: callers see `SqlExecutor`, the same
 * contract the Rust driver used before the migration.
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

/** The subset of the official `oo1.DB` this adapter uses. */
interface Oo1Db {
  exec(sql: string): unknown;
  exec(options: {
    readonly sql: string;
    readonly bind?: readonly SqlBind[];
    readonly rowMode?: "array";
    readonly returnValue?: "resultRows";
  }): unknown;
  changes(): number;
  close(): void;
}

interface PoolUtil {
  readonly OpfsSAHPoolDb: new (file: string) => Oo1Db;
  readonly vfsName: string;
  getCapacity(): number;
}

interface SqliteModule {
  readonly installOpfsSAHPoolVfs: (options: {
    readonly name: string;
    readonly directory: string;
    readonly initialCapacity: number;
    readonly clearOnInit: boolean;
    readonly preserveOnInitFailure: boolean;
  }) => Promise<PoolUtil>;
  readonly capi: { readonly sqlite3_vfs_find: (name: string) => unknown };
}

type InitModule = (options?: {
  readonly locateFile?: (file: string) => string;
}) => Promise<unknown>;

/**
 * Pool capacity.
 *
 * One pool serves one database: the main file, its rollback journal, and
 * possibly a temporary table file. Six entries covers that with headroom for a
 * second database file, without holding handles it does not need — every pool
 * entry keeps an OPFS sync handle open for the pool's lifetime.
 */
const INITIAL_CAPACITY = 6;

/** Deterministic, `sqlite3_vfs_register`-safe name for one storage identity. */
function poolNameFor(identity: string): string {
  // FNV-1a: short, stable across sessions, free of characters a VFS name or URI
  // cannot carry.
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `edapex_sah_${hash.toString(36)}`;
}

/**
 * The OPFS directory holding one identity's pool.
 *
 * A new namespace on purpose: the previous engine owned `edapex-session-*` with a
 * different on-disk layout, and pointing this VFS at it would let it treat
 * foreign files as its own. Old directories are left untouched, never deleted.
 */
export function poolDirectoryFor(identity: string): string {
  return `edapex-sah-${identity.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

let modulePromise: Promise<SqliteModule> | null = null;

async function loadSqlite(): Promise<SqliteModule> {
  if (modulePromise !== null) return modulePromise;
  modulePromise = (async () => {
    // Served from `public/`: a statically analysable specifier is rewritten by
    // the bundler into a module-graph id and fails at runtime.
    const url = new URL("/sqlite/index.mjs", globalThis.location.origin).href;
    const loaded: unknown = await import(/* @vite-ignore */ url);
    if (typeof loaded !== "object" || loaded === null || !("default" in loaded)) {
      throw new Error("storage_unavailable: the SQLite loader did not load");
    }
    const initialize = (loaded as { readonly default: unknown }).default;
    if (typeof initialize !== "function") {
      throw new Error("storage_unavailable: the SQLite loader exported no initializer");
    }
    const module = await (initialize as InitModule)({
      locateFile: (file: string) => new URL(`/sqlite/${file}`, globalThis.location.origin).href
    });
    if (!isSqliteModule(module)) {
      throw new Error("storage_unavailable: the SQLite module is missing installOpfsSAHPoolVfs");
    }
    return module;
  })();
  return modulePromise;
}

class SahPoolExecutor implements SqlExecutor {
  constructor(private readonly db: Oo1Db) {}

  executeBatch(sql: string): void {
    this.db.exec(sql);
  }

  execute(sql: string, params: readonly SqlBind[]): number {
    this.db.exec({ sql, bind: params });
    return this.db.changes();
  }

  query(sql: string, params: readonly SqlBind[]): SqlRow[] {
    const rows = this.db.exec({
      sql,
      bind: params,
      rowMode: "array",
      returnValue: "resultRows"
    });
    return Array.isArray(rows) ? (rows as SqlRow[]) : [];
  }

  begin(): void {
    this.db.exec("BEGIN IMMEDIATE");
  }

  commit(): void {
    this.db.exec("COMMIT");
  }

  rollback(): void {
    try {
      this.db.exec("ROLLBACK");
    } catch {
      // Rolling back a transaction that already ended must not mask the error the
      // caller is reporting.
    }
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Opens one identity's database in the OPFS-SAHpool VFS.
 *
 * Only call this while holding the Web Lock for the identity: installing the pool
 * twice for one directory from two workers fails, and preventing that is exactly
 * what the lease exists for.
 */
export async function openBrowserSqlite(options: {
  readonly identity?: string;
  readonly filename?: string;
} = {}): Promise<SqlExecutor & { readonly persistent: true; dispose(): Promise<void> }> {
  if (typeof navigator?.storage?.getDirectory !== "function") {
    throw new Error("storage_unavailable: the worker needs OPFS to persist the session");
  }
  const identity = options.identity ?? "legacy";
  const filename = options.filename ?? "/session.db";
  if (!filename.startsWith("/")) {
    throw new Error("invalid_input: opfs-sahpool requires an absolute database path");
  }

  const sqlite3 = await loadSqlite();
  const name = poolNameFor(identity);

  // `preserveOnInitFailure` is set explicitly: the default wipes the pool when
  // initialisation fails, which would destroy a user's database because of a
  // transient storage error. Recovery stays an explicit, authorised action.
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name,
    directory: poolDirectoryFor(identity),
    initialCapacity: INITIAL_CAPACITY,
    clearOnInit: false,
    preserveOnInitFailure: true
  });

  if (sqlite3.capi.sqlite3_vfs_find(name) === 0) {
    throw new Error("storage_unavailable: the OPFS-SAHpool VFS is not available");
  }

  const executor = new SahPoolExecutor(new pool.OpfsSAHPoolDb(filename));
  executor.executeBatch("PRAGMA foreign_keys = ON");

  return Object.assign(executor, {
    persistent: true as const,
    /**
     * Closes the database. The pool is deliberately **not** removed: it is reused
     * by later opens in this worker, and `removeVfs()` deletes every file in the
     * directory.
     */
    async dispose(): Promise<void> {
      executor.close();
    }
  });
}

function isSqliteModule(value: unknown): value is SqliteModule {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { readonly [key: string]: unknown };
  return typeof candidate.installOpfsSAHPoolVfs === "function"
    && typeof candidate.capi === "object"
    && candidate.capi !== null;
}
