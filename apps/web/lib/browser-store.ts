/**
 * The browser store.
 *
 * Composes the three pieces into the one thing the app needs:
 *
 *   OPFS SQLite (JS)  ←  SqlDriver  ←  Store (Rust)  ←  this wrapper
 *
 * The Rust side owns the schema, the per-record keys and the outbox, so the web
 * gets exactly the rules desktop gets. This module only supplies the engine and
 * adapts the result to the shapes the sync client expects.
 */

import { openBrowserSqlite, type SqlExecutor } from "./browser-sqlite";
import { loadAgentModule, type StoreBridge } from "./native-agent";
import type { Outbox, PushItem } from "./sync-client";

export interface OpenStoreOptions {
  /** 32 bytes. Derived by the host from the user's key material, never stored. */
  readonly masterKey: Uint8Array;
  readonly filename?: string;
}

export interface BrowserStore {
  /** False when OPFS is unavailable; the database then does not survive reload. */
  readonly persistent: boolean;
  readonly version: number;
  writeRecord(input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly workspaceId: string;
    readonly operation: "create" | "update" | "delete" | "tombstone";
    readonly extra?: readonly (readonly [string, string | number])[];
    readonly plaintext: Uint8Array | string;
    readonly searchText?: string | null;
    readonly deviceId: string;
    readonly createdAt: number;
  }): { readonly id: string; readonly deviceSeq: number };
  readRecord(entityType: string, entityId: string): Uint8Array;
  pushBatch(deviceId: string, limit: number): PushItem[];
  acknowledge(deviceId: string, workspaceId: string, throughSeq: number): void;
  cursor(deviceId: string, workspaceId: string): number;
  search(query: string, limit: number): string[];
  /** Adapter for `SyncClient`, so the loop needs no knowledge of the store. */
  asOutbox(workspaceId: string): Outbox;
  close(): void;
}

const OPERATIONS = ["create", "update", "delete", "tombstone"] as const;
type Operation = (typeof OPERATIONS)[number];

function toOperation(value: string): Operation {
  return (OPERATIONS as readonly string[]).includes(value) ? (value as Operation) : "update";
}

/** The Rust side reads `[["thread_id", {"text": "t-1"}], ["device_seq", {"integer": 1}]]`. */
function encodeExtra(
  extra: readonly (readonly [string, string | number])[] | undefined
): string {
  if (extra === undefined) return "[]";
  return JSON.stringify(
    extra.map(([name, value]) =>
      typeof value === "number"
        ? [name, { integer: Math.trunc(value) }]
        : [name, { text: value }]
    )
  );
}

/** Parses the Rust-emitted batch into the shape the sync client consumes. */
function parseBatch(json: string): PushItem[] {
  const items = JSON.parse(json) as {
    id: string;
    entityType: string;
    entityId: string;
    operation: string;
    ciphertext: string;
    checksum: string;
    deviceSeq: number;
    createdAt: number;
  }[];
  return items.map((item) => ({ ...item, operation: toOperation(item.operation) }));
}

function asBytes(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

export async function openBrowserStore(options: OpenStoreOptions): Promise<BrowserStore> {
  if (options.masterKey.length !== 32) {
    throw new Error("The master key must be exactly 32 bytes.");
  }

  const [executor, module] = await Promise.all([
    openBrowserSqlite(
      options.filename === undefined ? {} : { filename: options.filename }
    ),
    loadAgentModule()
  ]);

  const store: StoreBridge = new module.SqlStore(executor as SqlExecutor, options.masterKey);
  store.migrate();

  return {
    persistent: executor.persistent,
    version: store.version(),

    writeRecord(input) {
      const written = JSON.parse(
        store.writeRecord(
          input.entityType,
          input.entityId,
          input.workspaceId,
          input.operation,
          encodeExtra(input.extra),
          asBytes(input.plaintext),
          input.searchText ?? null,
          input.deviceId,
          input.createdAt
        )
      ) as { id: string; deviceSeq: number };
      return written;
    },

    readRecord(entityType, entityId) {
      return store.read_record(entityType, entityId);
    },

    pushBatch(deviceId, limit) {
      // The Rust side emits the exact body the service accepts, so this is a
      // pass-through rather than a second mapping that could drift.
      return parseBatch(store.pushBatch(deviceId, limit));
    },

    acknowledge(deviceId, workspaceId, throughSeq) {
      store.acknowledge(deviceId, workspaceId, "default", throughSeq);
    },

    cursor(deviceId, workspaceId) {
      return store.cursor(deviceId, workspaceId, "default");
    },

    search(query, limit) {
      return JSON.parse(store.search(query, limit)) as string[];
    },

    asOutbox(workspaceId) {
      return {
        async nextBatch(deviceId, limit) {
          return parseBatch(store.pushBatch(deviceId, limit));
        },
        async acknowledge(deviceId, _workspaceId, throughSeq) {
          // The scope is fixed at "default"; the parameter exists so the
          // interface stays usable if scopes are introduced.
          store.acknowledge(deviceId, workspaceId, "default", throughSeq);
        }
      };
    },

    close() {
      executor.close();
    }
  };
}
