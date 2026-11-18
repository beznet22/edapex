import type { Outbox, PushItem } from "./sync-client";
import type { StoreRequestBody, StoreResponse } from "../worker/store.worker";
import type { WriteRecordInput } from "./browser-store-core";

export type { WriteRecordInput } from "./browser-store-core";

/**
 * The page-side handle on the store.
 *
 * Nothing here touches SQLite: `opfs-sahpool` needs a sync access handle, which
 * only exists in a dedicated worker, so every call is a request to
 * `worker/store.worker.ts`. The API stays close to the old synchronous one — the
 * only difference a caller sees is the `await`.
 */

export interface OpenStoreOptions {
  /** 32 bytes. Derived by the host from the user's key material, never stored. */
  readonly masterKey: Uint8Array;
  readonly filename?: string;
}

/** A failure reported by the store worker, with its code preserved. */
export class BrowserStoreError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BrowserStoreError";
  }
}

export interface BrowserStore {
  readonly persistent: boolean;
  readonly version: number;
  writeRecord(input: WriteRecordInput): Promise<{ readonly id: string; readonly deviceSeq: number }>;
  readRecord(entityType: string, entityId: string): Promise<Uint8Array>;
  pushBatch(deviceId: string, limit: number): Promise<PushItem[]>;
  acknowledge(deviceId: string, workspaceId: string, throughSeq: number): Promise<void>;
  cursor(deviceId: string, workspaceId: string): Promise<number>;
  search(query: string, limit: number): Promise<string[]>;
  rebuildSearchIndex(): Promise<number>;
  /** Adapter for `SyncClient`, so the loop needs no knowledge of the store. */
  asOutbox(workspaceId: string): Outbox;
  close(): Promise<void>;
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

function isWriteResult(value: unknown): value is { id: string; deviceSeq: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "deviceSeq" in value &&
    typeof value.deviceSeq === "number"
  );
}

function isPushItems(value: unknown): value is PushItem[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item: unknown) =>
      typeof item === "object" &&
      item !== null &&
      "deviceSeq" in item &&
      typeof item.deviceSeq === "number" &&
      "checksum" in item &&
      typeof item.checksum === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function mismatch(label: string): never {
  throw new BrowserStoreError("invalid_response", `The store worker returned an invalid ${label}.`);
}

export async function openBrowserStore(options: OpenStoreOptions): Promise<BrowserStore> {
  if (options.masterKey.length !== 32) {
    throw new BrowserStoreError("invalid_request", "The master key must be exactly 32 bytes.");
  }

  const worker = new Worker(new URL("../worker/store.worker.ts", import.meta.url), {
    type: "module"
  });
  const pending = new Map<string, Pending>();

  worker.onmessage = (event: MessageEvent<StoreResponse>): void => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.type === "failed") {
      entry.reject(new BrowserStoreError(message.code, message.message));
      return;
    }
    entry.resolve(message.type === "opened" ? { persistent: message.persistent, version: message.version } : message.value);
  };

  worker.onerror = (event: ErrorEvent): void => {
    for (const entry of pending.values()) {
      entry.reject(new BrowserStoreError("storage_unavailable", event.message || "The store worker failed."));
    }
    pending.clear();
  };

  const request = <T>(body: StoreRequestBody, decode: (value: unknown) => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, {
        resolve: (value) => {
          try {
            resolve(decode(value));
          } catch (error) {
            reject(error);
          }
        },
        reject
      });
      worker.postMessage({ ...body, id });
    });

  const opened = await request(
    {
      type: "open",
      masterKey: Array.from(options.masterKey),
      ...(options.filename === undefined ? {} : { filename: options.filename })
    },
    (value) => {
      if (typeof value !== "object" || value === null) return mismatch("open result");
      if (!("persistent" in value) || typeof value.persistent !== "boolean") {
        return mismatch("open result");
      }
      if (!("version" in value) || typeof value.version !== "number") {
        return mismatch("open result");
      }
      return { persistent: value.persistent, version: value.version };
    }
  );

  const store = {
    persistent: opened.persistent,
    version: opened.version,

    writeRecord(input: WriteRecordInput) {
      return request({ type: "writeRecord", input }, (value) =>
        isWriteResult(value) ? value : mismatch("write result")
      );
    },

    readRecord(entityType: string, entityId: string) {
      return request({ type: "readRecord", entityType, entityId }, (value) =>
        value instanceof Uint8Array ? value : mismatch("record")
      );
    },

    pushBatch(deviceId: string, limit: number) {
      return request({ type: "pushBatch", deviceId, limit }, (value) =>
        isPushItems(value) ? value : mismatch("push batch")
      );
    },

    async acknowledge(deviceId: string, workspaceId: string, throughSeq: number) {
      await request({ type: "acknowledge", deviceId, workspaceId, throughSeq }, () => undefined);
    },

    cursor(deviceId: string, workspaceId: string) {
      return request({ type: "cursor", deviceId, workspaceId }, (value) =>
        typeof value === "number" ? value : mismatch("cursor")
      );
    },

    search(query: string, limit: number) {
      return request({ type: "search", query, limit }, (value) =>
        isStringArray(value) ? value : mismatch("search result")
      );
    },

    rebuildSearchIndex() {
      return request({ type: "rebuildSearchIndex" }, (value) =>
        typeof value === "number" ? value : mismatch("rebuild count")
      );
    },

    close() {
      return request({ type: "close" }, () => undefined).finally(() => {
        for (const entry of pending.values()) {
          entry.reject(new BrowserStoreError("storage_unavailable", "The store was closed."));
        }
        pending.clear();
        worker.terminate();
      });
    }
  };

  return {
    ...store,
    asOutbox(workspaceId: string): Outbox {
      return {
        async nextBatch(deviceId, limit) {
          return store.pushBatch(deviceId, limit);
        },
        async acknowledge(deviceId, _workspaceId, throughSeq) {
          // The scope is fixed at "default"; the parameter exists so the
          // interface stays usable if scopes are introduced.
          await store.acknowledge(deviceId, workspaceId, throughSeq);
        }
      };
    }
  };
}
